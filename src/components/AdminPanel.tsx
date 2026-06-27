import { ChangeEvent, MouseEvent as ReactMouseEvent, TouchEvent as ReactTouchEvent, useEffect, useMemo, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { pinyin } from 'pinyin-pro';
import { adminExportVisits, adminImportVisits, createUser, getUsers } from '../api';
import { CITIES } from '../data/cities';
import { useStore } from '../store/useStore';
import FuzzySelect from './ui/FuzzySelect';
import Table from './Table';
import ImportPreviewTable from './ImportPreviewTable';
import Icon from './Icon';
import type { ImportVisitRow } from '../types';
import type { AdminVisitExportRow } from '../api';

/** 把中文文本转成不带空格的全拼，供拼音模糊匹配使用 */
function toPinyinKey(text: string): string {
  return pinyin(text, { toneType: 'none' }).replace(/\s+/g, '');
}

/** 给一组候选字符串批量生成 "自身 -> 全拼" 的映射字典 */
function buildPinyinMap(options: string[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const option of options) {
    map[option] = toPinyinKey(option);
  }
  return map;
}

const LEDGER_PAGE_SIZE = 10;
const CHANGELOG = [
  { date: '2026-06-27', items: ['弹窗内表单/输入框颜色跟主题色脱节问题修复(三处)：①.input默认背景用--color-background(各主题下都接近纯白)，跟.card/.modal统一用的8%主题tint公式脱节，改为.card .input/.modal .input统一用--color-surface-container-low(已有的、每个主题下有明显色相偏移的标准色阶变量)，顺手删除UserProfile两处只读输入框上变成多余的内联background style；②.modal内嵌套.card(添加访问/修改密码/导入预览等表单卡片)原跟.modal用完全相同的8%混色公式，背景几乎融为一体看不出卡片边界，新增命名变量--modal-card-tint-pct(16%，--card-tint-pct的两倍)，写明跟--topbar-tint-pct同属\'故意偏离默认值、且写明原因\'的命名变量，不是裸数字；③--color-focus-ring(输入框聚焦光晕)原是写死在:root全局块里的rgba(0,102,255,.12)蓝色，没有放进5个主题各自的变量块，导致除冰河主题外其余4个主题点击输入框都会冒出跟主题色不搭的蓝色光晕，改用color-mix引用--color-primary，透明度保留12%，色相自动跟随当前主题。'] },
  { date: '2026-06-27', items: ['【重大】新增项目唯一的标准表格组件Table.tsx(src/components/，本地实现，不放进软链接到shared-ui-components共享库的src/components/ui/——重度绑定.data-table等项目专属CSS和Icon组件，不是行为通用的共享组件)。列配置驱动(参照MUI/PrimeReact/TanStack Table思路，但当前规模不需要排序/筛选/虚拟滚动，未引入任何表格库依赖)，封装表格结构、空状态(colSpan自动按列数算)、行级条件样式(rowClassName)、三种滚动模式：none(不限高，配合外部分页器)/fixed+maxHeight(固定像素高度滚动，如导入预览类小表)/fill(flex:1+min-height:0占满父级flex剩余空间，用于父容器高度本身是flex动态分配的场景，如用户管理表)。', '同步抽出ImportPreviewTable.tsx，合并AdminPanel(数据管理)和UserProfile(访问记录)两处此前几乎一字不差重复的导入预览表实现为一份，按error值(\'城市已存在\'/\'文件内重复\')统一判定警告/错误样式，不改变两边各自独立的导入校验逻辑(AdminPanel批量导入特有的\'文件内重复\'判定UserProfile从不会产生，该值在共享渲染规则里只是恒为false，不影响展示)。', '迁移全部5处表格(用户管理/数据管理总账表/数据管理导入预览/访问记录/访问记录导入预览)到新组件，删除从未被引用的死代码ScrollableTable.tsx。', '顺手修复CSS已知坑：.data-table的border-collapse从collapse改为separate(+border-spacing:0)——社区已知sticky表头在collapse模式下部分浏览器存在边框渲染异常的问题，跟本项目之前放弃修复的\'滚动条压表头\'是不同性质的问题，顺手处理。新增.is-row-warning/.is-row-error两个class替代原来两处导入预览表内联style硬编码color-mix颜色的写法。', '访问记录tab(UserProfile.tsx)三项调整：①表格补scroll="fixed"+maxHeight=320，此前该表没有任何独立滚动限制，只能靠整个.modal-xl弹窗在90vh触发滚动，表头sticky没有意义；②操作列\'编辑/删除\'从.btn-outline/.btn-danger改为.btn-tertiary/.btn-tertiary-danger，并将容器class从该表独有的.mini-actions(连带其专属尺寸覆盖规则一并删除)改为跟AdminPanel用户管理表统一的.row-actions，对齐\'表格行内并列操作用低强调样式\'规范；③调整布局顺序：操作按钮(添加访问/导入数据/导出数据/下载模板/清空所有数据/统计)及其触发的导入预览/添加表单面板移到表格上方，表格本身移到最下面，对齐AdminPanel数据管理tab\'操作按钮→条件面板→表格→分页器\'的既有顺序；表格补mt-12防止与上方按钮行贴在一起。'] },
  { date: '2026-06-26', items: ['【重大】全项目按钮风格审计第一阶段：发现用户管理模块(AdminPanel.tsx)内部自建了一套平行于全局.btn-primary/.btn-outline/.btn-danger、互不统一的重复实现(.card-btn系/.edit-link-btn/.admin-user-card-action)。按业内成熟定乍(表格/列表行内并列多个常规操作用tertiary低强调文字样式，保存/取消这类确认动作仍保持primary/outline同样显眼程度)，全部收敛进本体系：新增.btn-tertiary(次要文字色)/.btn-tertiary-danger(error色但不加投影背景)/.btn-primary.compact、.btn-outline.compact(方角小尺寸)。颜色全部复用标准变量(--color-on-surface-variant/--color-error)，不引入任何color-mix混合出的派生值。已覆盖PC表格+移动端卡片全部入口。仍待处理：个人信息弹窗/访问记录表格/数据管理等模块仍未纳入，将另安排推进。', '表格样式三处修复：¹单元格文字vertical-align从 top 改为 middle(以前为适配换行内容设的top，现各列内容高度基本一致，top对齐反而偏上)；²修复数据行比表头明显高的问题，根因是按钮36px高度+<td>本身10pxpadding叠加，不缩小按钮(符合WCAG/Material触摸目标最小尺寸)，改为仅针对包含.row-actions的单元格单独收紧padding(用:has()选择器定位，2026年已全部主流浏览器支持）；³发现“新增用户”靠左、“查询/导出”等数据管理按钮组靠右的不一致，根因是.actions这个通用class默认justify-content为flex-end。按业内共识(默认靠左、靠右只是少数例外)确定项目规范：.actions默认改为flex-start，涉及AdminPanel/UserProfile/CityDrawer三个文件共9处。保留两个有独立设计理由的例外不动：分页器(.flex-between两端对齐)、已删除的海报预览弹窗(.flex-center居中)。', '清理未接入UI的死代码：PosterGenerator.tsx组件从未被任何地方import/触发(没有按钮能打开它，其依赖的posterOpen状态从未被设为true)，是个从未上线过的半成品。已删除该组件文件，并同步清理store(useStore.ts)里 posterOpen/setPosterOpen 相关定义、CSS里.poster-preview样式。用户确认这是死代码后才删除，不是喇默判断。'] },
  { date: '2026-06-26', items: ['【重大修复】用户管理移动端列表完全消失问题，是上一轮修复PC端断点失效问题时引入的回归。根因：上一轮把默认态的.mobile-only改为了display:none!important，但!important这个优先级在移动端断点内依然全局生效(它不在任何@media限制范围内)，而移动端断点内只写了隐藏desktop-only、没有任何规则去解除mobile-only这个!important，导致移动端下.admin-user-cards{display:grid}永远被!important压住、用户列表一直是隐藏状态(上一次以为"交还给业务class自决定"是可行的，但!important是全局生效、不跟视口宽度区分，这个假设本身不成立)。修复：不再依赖跨class自动回退，改为按每个实际用途分别明确补出该class本身需要的display值（.admin-user-cards.mobile-only补grid!important，.mb-16.mobile-only补block!important）。已由用户真机确认修复生效。'] },
  { date: '2026-06-26', items: ['用户管理PC端表头固定（sticky）一度仍未生效的问题继续补完：上一轮修复(补上.admin-tab-viewport的display:flex)后，.users-table-wrap高度能被正确压缩到父级分配的实际空间、不再被外层抢滚动权，但当时未由用户在真机上最终确认sticky是否真正生效。本轮经用户真机滚动验证确认、表头sticky现已真正固定生效。同时针对用户反馈“表头被浏览器默认滚动条压住”问题，先用.table-wrap::-webkit-scrollbar系列重制了表格区域的滚动条，改用项目CSS变量调色、宽度从浏览器默认细化到6px，五个主题下都能跟调性一致。滚动条“压住表头”这个更深层的视觉问题本轮尝试了两种方案(table本体padding+负 margin拉回；::-webkit-scrollbar-track 加margin-top)均未能真正解决（前者会干扰sticky计算、后者实测滚动条位置未变化），已按用户要求撤回这两次尝试、补上代码注释记录，暂抬后。后续若要彻底解决，需要把表头从<table>结构中拆出来单独做一层。'] },
  { date: '2026-06-26', items: ['【重大修复】PC端宽屏下“用户管理”页签曾错误显示移动端卡片列表而非桌面表格，根因排查耗时较长（此前曾误判为媒体查询/视口宽度问题，code review 反复确认 @media(max-width:767px) 本身闭合正确，但仍无法解释现象）。用F12“已计算(Computed)”面板追溯display属性完整层叠链后定位真正根因：.mobile-only{display:none} 与业务class（如.admin-user-cards{display:grid}）选择器优先级完全相同（都是单class），CSS层叠规则下“源码里写得更靠后的规则赢”，跟视口宽度、媒体查询是否命中完全无关——.admin-user-cards写在.mobile-only之后，导致即使在宽屏下，display:none也会被display:grid覆盖。修复方案：仅给.mobile-only的隐藏态加!important（隐藏态用none!important绝对安全，不影响显示态具体取值是block还是grid）；不能反过来给显示态统一指定block!important，会破坏需要grid布局的业务class。'] },
  { date: '2026-06-26', items: ['用户管理桌面表格三处整改：①"密码"列(重置密码)与"操作"列(删除)合并为统一的操作列，两个按钮并排，不再分散在两处；②用户名与@username合并同一行(baseline对齐)展示，不再纵向堆叠撑高每行；③新增固定高度+内部滚动，配合表头sticky，数据量增多时表头始终可见', '修正表格行内操作按钮视觉权重不统一的问题：此前直接复用.btn-outline/.btn-danger，但后者带描边+投影是专为弹窗"确认删除"这类独立高风险操作设计的，跟同行的"重置密码"并排显得一个朴素一个浮起、长短不一。改为复用项目已有的.card-btn体系（同一行内多个平级操作的既有方案），危险感交给点击后弹出的确认弹窗承担，列表本身保持克制', '管理员账号禁止从普通用户登录入口登录。根因：普通登录只加载该用户自己的足迹数据，不会像管理员登录那样额外拉取用户列表，导致管理员从普通入口登录后能进入系统、但"用户管理/数据管理"数据全是空的。现在普通登录检测到管理员账号会直接拒绝并提示改用管理员登录入口'] },
  { date: '2026-06-26', items: ['移动端批量删除交互（长按进入多选→勾选→统一删除）：原长按方案在真机测试中跟系统原生文本选择/分享菜单冲突，改为业内常见的长按进多选模式，勾选后批量删除。两轮真机踩坑：①需在touchstart时主动preventDefault才能真正拦住系统长按菜单，onContextMenu只能拦右键、拦不住移动端长按；②需用位移阈值区分长按手指轻微抖动和真实滑动/边缘返回手势，超出阈值才放行默认行为，否则会误拦正常滚动', '删除确认改用项目自有modal样式替代浏览器原生window.confirm，单个删除和批量删除共用同一套确认逻辑（pendingDelete统一为数组）。弹窗视觉效果经过四轮方案对比迭代：列表背景加深方向因色阶台阶过细、肉眼难辨而放弃，改为更符合业内惯例的浅底+左侧危险色细条强调，呼应下方确认按钮的危险色语义', '修复确认删除/取消按钮在浅色主题背景下因描边/背景色对比度不足而显得不清晰的问题：.btn-danger加自身加深描边+投影；.btn-outline全局描边改用主文字色半透明混色（影响所有用到该组件的场景，非局部打补丁）', '修复多选模式下相邻选中卡片描边贴在一起视觉上像连成一条线的问题：卡片间距从12px提到16px，选中态新增柔和外发光代替单纯硬边线分界'] },
  { date: '2026-06-21', items: ['「用户管理」移动端卡片真机验证后两轮修复：①卡片内容居中、大量空白——根因排查发现新增的.user-card与登录页"选择账号"组件的.user-card撞名（登录页那套是display:grid+justify-items:center的居中布局），两套规则叠加导致表现异常；这是开发时未先检索class名是否已被占用造成的命名冲突，不是间距数值问题。统一改名为admin-user-card-*前缀，与登录页组件完全隔离。②"重置密码"按钮文字换行折叠成两行——根因是.card-btn缺少white-space:nowrap，窄屏下flex:1分到的宽度不够容纳4个字被迫换行；已加nowrap+text-overflow:ellipsis+min-width:0修复。③数字卡片(总用户/管理员/总访问)和"新增用户"按钮挪到.admin-tab-viewport外部固定在顶部，不再随用户列表滚动——用户体验反馈"列表滚动时希望这些信息保持可见"；放在viewport外部、tab按钮同级是更简单可靠的方案，避免在viewport内部再嵌一层sticky可能重演"外层内层抢滚动权"的问题（此前修复tab切换高度跳动时已踩过这个坑）'] },
  { date: '2026-06-21', items: ['管理员面板「用户管理」页签移动端整改：①修复数字统计卡片(总用户/管理员/总访问)被误改为单列堆叠的问题——根因是.admin-stats被错误归类进".form-grid-2"这条移动端规则(本意是表单输入框分两栏改单列)，三个简短数字横排三栏完全不挤且信息密度更高，已从该规则移除独立处理，移动端保持横排三栏只收紧内边距。②用户列表移动端从表格改为卡片列表——根因排查发现.data-table设了min-width:720px(桌面表格设计思路)，移动端无任何专属断点处理，导致表格被硬塞进手机屏幕靠横向滚动适配，文字相对显得小、操作按钮也要滚动才能点到；用户截图标注确认调整方向是把用户列表"往大调"去匹配数字卡片的视觉重量，而非反向调小那些被多个场景复用、风险更大的组件。桌面端表格保持不变（用.desktop-only/.mobile-only配合767px断点切换，不用JS判断设备）。③新增移动端"修改昵称"按钮：PC端原是输入框失焦自动保存模式，移动端改为明确的"修改→保存/取消"确认式交互（不依赖PC端才有的隐含习惯），保存时复用与PC端完全相同的updateAnyUserName接口，不另写保存逻辑。④保存/取消按钮与重置密码/删除按钮统一为同一套按钮规格（同高度var(--size-btn-default)/同字号/同圆角/等宽flex布局），避免迭代过程中两套按钮各写一份互不对齐的问题'] },
  { date: '2026-06-21', items: ['管理员面板「系统文档」页签整改：①根治tab切换高度跳动——根因是用户管理/数据管理两个tab的表格内容随实际用户数/访问记录数动态变化，固定min-height只是凑当下数据量，用户数增长后依然会跳；改为结构性方案，tab按钮固定在外部不滚动，三tab内容统一包进.admin-tab-viewport（固定高度+内部overflow:auto），同时修复.modal-admin覆盖掉继承的overflow:auto（外层若可滚动会跟内层抢滚动权，导致方案不生效），从根本上让外层弹窗高度恒定，不依赖任何猜测数值。②配色重做：分类标题（如"设计文档·最后更新..."）原跟链接同用--color-primary，红色无差别铺满整块区域，改为次要文字色，红色只留给真正可交互的链接。③按文档类型（设计/功能/协作/升级记录）拆分为独立卡片，粉色只露在卡片间缝隙形成天然分组，不需要额外分隔线；每张卡片整体可点击（不只是链接文字），链接描述文字降为次要色与链接标题形成层级区分，卡片加细描边+hover反馈增强交互鲁棒性'] },
  { date: '2026-06-21', items: ['首页视觉层级优化：用户截图反馈顶栏和统计面板浓度几乎相同，整页缺乏主次区分，地图被夹在两块同色块中间未被强调。解决方案是把顶栏单独降低主题色混入比例(--topbar-tint-pct: 8%→4%)，统计卡片等其余容器维持原有8%暖度不变(--card-tint-pct不变)——只精简改动范围为"顶栏单独退一档"，不大改其余容器的暖色调性。仍复用标准--color-primary做混色源，不引入新的独立色值变量'] },
  { date: '2026-06-21', items: ['主题系统全量重制：删除Linear主题（原紫色，色阶层次单薄、l5/l6需手动压深才能达标），新增三个主题：琥珀(amber)、绿松(turquoise)、冰河(azure)；晨雾(原Stripe)色相由漂移不一致的H247.7统一调整为标准紫调H262；最终五个主题为樱花/晨雾/琥珀/绿松/冰河，命名风格统一为"中文意象名+色调"', '色阶生成方式从手工逐主题调色改为统一算法：基于樱花反推出"L非线性曲线(power=1.6幂函数)+S抛物线"公式，仅需指定主色相(Hue)即可推导全部7档色阶，解决了手调色阶之间深浅不均匀、跨主题层次感不一致的问题；中后段(l3/l4/l5)间距特意拉大、前段(l0/l1)压缩，修复了线性曲线下"中间三档肉眼难以区分"的问题', '危险操作色（清空数据等）不再使用红色系，改为各主题色阶最深档l6，规则为"l6明度=主色明度−10%"，确保危险色在视觉上比主色更深更沉，用深浅而非色相传递警示感，五个主题统一此规则', '同步更新：ThemeMode类型定义、TopBar主题切换菜单选项、.glass选择器（删除linear/stripe重复条目简化为统一规则）、login/loading页面渐变背景（五主题各自配色）、地图省名标注光晕色对比度验证（五主题下均≥4.5，达WCAG AA标准）'] },
  { date: '2026-06-20', items: ['移动端统计面板收起态去除主题色边框和发光动画，改为跟其他卡片一致的中性边框（桌面端不变）', '顶部导航条混入一点主题主色，让Linear/Stripe/Rose三个主题的顶栏更有区分度', '移动端地图控件（返回省级/重置视图/缩放）重新设计为圆角胶囊样式，跟旁边的视图标签风格统一，告别此前的方块堆叠样式'] },
  { date: '2026-06-20', items: ['"系统设置"改名"主题选择"并移出个人资料弹窗，改为顶部账号下拉菜单里的二级展开列表（点击"主题选择"原地展开Linear/Stripe/Rose选项，不再跳转或弹出独立窗口，方便未来扩展更多主题）', '清理从未被使用的重复设置面板组件（SettingsPanel）及其关联状态，相关功能已整合进访问记录页和新的主题选择入口'] },
  { date: '2026-06-20', items: ['修复地图省名标注颜色回归：上次修复可读性时误将"点亮用主色/未点亮用灰色"统一改成了主色，已恢复点亮/未点亮的颜色区分，同时验证灰色文字配新的光晕方案依然清晰可读'] },
  { date: '2026-06-20', items: ['"系统管理"从个人资料弹窗的四个tab之一移出，改为顶部账号下拉菜单的独立入口（位于"个人资料"和"退出登录"之间），点击后打开独立的管理员面板弹窗，不再与个人信息/访问记录/系统设置共享同一个弹窗容器，从根上解决切换tab时面板高度跳变的问题'] },
  { date: '2026-06-20', items: ['清空所有数据按钮颜色调整：Linear/Stripe主题下error色由纯正红改为带主题紫调的红（保留危险操作的红色警示属性）', '修复主题切换后地图颜色需要二次操作才生效的问题：地图渲染逻辑此前未监听主题状态变化', '修复地图省名标注在深色块下不易辨认、且原白色光晕在暗色主题下显得模糊发雾的问题：改为文字色统一用主题主色、光晕色跟随主题背景色，光晕模糊度调小；连带把Linear主题色阶最浅两档调深以保证可读性'] },
  { date: '2026-06-20', items: ['解决4项遗留UI一致性问题（待办列表中需要设计判断的项目）：①顶部用户名改为下拉菜单（个人资料/退出登录），替代原来"用户名无边框+退出按钮有描边"两种视觉语言混用的写法；②统计面板标题不再随内容滚走：桌面端补上面板级滚动容器（此前完全没有，内容多时面板会被无限撑高甚至超出视口），标题用sticky手法固定，桌面/移动端两套padding值通过CSS变量统一管理避免错位；③管理员面板"导出当前视图"按钮从实心改为描边，与"导入数据/下载模板"视觉权重一致，"查询"成为这组操作里唯一的实心主操作；④修复"用户管理"切换"数据管理"页签时弹窗整体宽度跳变的问题：根因是.data-table的720px固有最小宽度，经由.modal→.stack→.embedded-panel三层grid容器（均未设置min-width:0）一路向上传导撑大了弹窗本身，而不是表格自身的横向滚动没生效——已在三层补齐min-width:0切断传导链'] },
  { date: '2026-06-20', items: ['顶部导航栏Logo新增图标和slogan：图标采用🗺️（与登录页brand-mark保持一致），文案统一为“记录你走过的每一座城”（登录页/顶部导航栏三处同步），移动端窄屏隐藏slogan只保留图标和标题，避免和右侧用户区域挤在一起'] },
  { date: '2026-06-20', items: ['地图城市标签弹窗边框颜色不再跟随城市的染色梯度变化，改为固定使用当前主题的品牌主色', '地图"点亮/未点亮"城市与省份标签颜色不再固定写死，已点亮统一改为当前主题的品牌主色，未点亮改为次要文字色，三主题各自配专属值', '修复管理员/个人面板切换时整体高度忽上忽下的问题：根因是弹窗容器只设置了最大高度没有最小高度，不同页签内容量差异很大', '调整管理表格表头字号：从12px调到13px（与页签同字号），并加粗为700字重，解决"列表内容字体比表头还大"的问题', '修复统计面板边框"隐隐发红"的问题：根因是.card统一阴影里硬编码了旧主色的RGB分量，已同步更新为新主色RGB', '地图悬停预览色不再固定为黄色，改为复用--color-warning变量，三主题各自配专属色值', 'Rose主题主色微调：--color-primary 由 #F95D84 改为 #E0083E，修复主按钮白色文字对比度不达标的问题（3.03:1→4.91:1，达到WCAG AA标准）', '同步更新设计系统文档里的色彩系统主表，用脚本逐项核对替换为真实色值'] },
  { date: '2026-06-20', items: ['复核设计系统文档与代码实际状态的一致性（不改变用户可见功能）：修正“组件尺寸”表四个数值错误（输入框/大按钮/图标/大图标尺寸，文档与 index.css 实际定义不一致）；用 WCAG 标准公式重新计算颜色对比度表格，原数值经核实为估算而非实算（三套主题多处填了完全相同的数字，这在数学上不可能，是没有真算的明显信号），现已标注每个变量是否真的被组件引用，区分“不达标且在用、需要处理”和“不达标但未使用、暂无风险”两类问题', '补充文档此前完全遗漏的“地图染色梯度”章节（--color-dur-l*/--color-dep-l*，是地图色块染色的核心实现）；纠正“全局状态规范”一节表述，原称 empty-state/loading/error-state 三个class“已实现”，复核后确认目前未被任何组件引用，应为“已定义、待采用”；顺手修复 index.css 中 .empty-state 被重复定义两次的隐藏隐患（合并为一份）'] },
  { date: '2026-06-20', items: ['修复打开管理员面板时地图标签浮在面板上方的问题：根因是 pinch 缩放期间地图容器会被加上 CSS transform，这会建立新的 CSS 层叠上下文，导致挂载在容器内部的地图标签（tooltip）的 z-index 无法越过容器边界去和管理员面板比较层级，与之前修复过的同类问题（tooltip默认挂载位置）是完全不同的诱因；同时纠正了一个长期存在的错误认知：之前以为 tooltip 默认挂载到 document.body 且配置的 z 数值会生效，实际上默认挂载在地图容器内部，且 ECharts 在当前渲染模式下完全不读取 z 配置，之前写的数值从未真正生效，只是恰好没暴露出问题', '改为用 tooltip.appendTo:"body" 让标签挂载到页面最外层，脱离地图容器的层叠上下文影响，再配合新增的 .map-tooltip CSS class（用 !important 覆盖 ECharts 库内部硬编码的 z-index，因为内联样式优先级天生更高）把层级压回项目自己的语义化体系，与用户下拉菜单同级，低于所有弹窗模态框'] },
  { date: '2026-06-20', items: ['地图缩放错位问题第三次修复，改为更直接的方式：之前两次修复（边界钳位分叉、geojson数据不同源）都解决了真实存在的问题，但用户用真实设备录屏反复验证后，确认放大后两层仍会出现统一方向的整体偏移，且不需要撞到任何边界即可复现——说明还有未查实的诱因。这次不再继续猜测具体机制，改为更直接的工程方式：放弃此前给主图层和省界轮廓层各自独立广播相同缩放增量、让二者各自计算的方案，改为只驱动主图层，再读取它的真实渲染状态（ECharts公开API getZoom/getCenter）原样复制给省界轮廓层，从机制上消除两者各自独立计算可能产生分叉的可能性'] },
  { date: '2026-06-20', items: ['彻底修复全国视图放大后主图层色块与省界轮廓线错位的问题（此前一次修复只解决了边界钳位分叉这一个次要诱因，未命中用户反馈的核心症状）：用 shapely 量化排查发现真正根因是 china-provinces-outline.json 并非由 china-cities.json 精确 union 生成，而是来自某次独立处理流程，与市级数据存在局部几何偏差（典型例子：海南省在两份文件里的纬度最小值相差约0.12度），这类局部偏差恰好落在全国地图最南端边界附近，被放大成两个 ECharts series 坐标系初始投影比例的差异，导致放大后两层立刻可见错位（不需要累积触发，与之前的边界钳位分叉是完全不同性质的问题）', '新增 scripts/regen_province_outline.py：直接从市级数据精确 union 重新生成省级轮廓，确保两份文件永久同源，避免未来市级数据更新后再次出现脱节；已验证脚本幂等（重跑不改变文件 MD5）'] },
  { date: '2026-06-20', items: ['修复全国视图放大后主图层色块与省界轮廓线持续性错位的问题：根因是 ECharts 内部对双 series geoRoam 缩放的边界钳位（0.5~12倍）是各自独立计算的，即使两层收到完全相同的缩放增量，只要某一帧其中一层先撞到边界、另一层还没撞到，二者就会产生实际缩放倍率的分叉且不会自愈；修复方式是广播前先用统一状态算出裁剪后的目标缩放，再反推出同一个有效增量广播给两层，从根上消除分叉触发条件', '修复鼠标滚轮缩放和触摸pinch缩放走的是两条独立代码路径，pinch路径此前未经过上述修正逻辑，导致该场景下错位修复未生效的问题：现统一改为调用同一处缩放函数'] },
  { date: '2026-06-20', items: ['MapView 性能优化：ECharts 从全量 import 改为按需引入（仅注册 map 系列 + tooltip + markPoint），打包体积从约1.63MB降至约46万字节，减少72%', '离线兜底地图数据改为动态 import：原本静态打包进主 chunk 的约57万字节兜底 GeoJSON，改为仅在网络请求失败时才单独加载', '清理未使用依赖 echarts-for-react（项目实际直接调用 echarts 原生 API，从未 import 过该库）'] },
  { date: '2026-06-20', items: ['升级记录入口整合：从管理员面板独立页签移至系统文档页签，点击链接弹窗展示', '图标系统统一：20处 emoji/文字符号替换为 SVG 图标组件（Icon.tsx）', '新增变量：--space-7(28px)、--space-9(36px)、--font-4xl(48px)', '消除硬编码：登录面板 padding、空状态图标 font-size 引用变量', '工具类引用变量：.p-16/.p-24/.p-32/.gap-8/.gap-10 改用 CSS 变量', '小箭头 SVG 化：▲▼ 文字符号改为内联 SVG，消除 11px 硬编码', '修复部署流程：rsync 去掉 --delete，避免删 docs 目录', '响应式断点规范化（767px/768px/1024px），CSS 注释记录', '颜色对比度检查：Rose 主题成功色/警告色略低，标注使用限制', '设计文档更新：响应式断点、全局状态规范落实，去掉"待定义"'] },
  { date: '2026-06-20', items: ['建立设计系统文档（docs/设计系统-2026-06-20.md）：完整设计 token 体系、组件规范、可访问性规范', '新增可访问性支持：:focus-visible 焦点环、prefers-reduced-motion 减少动效', '新增全局状态类名：.empty-state / .loading / .error-state', '修复 6 处硬编码：font-size/gap/z-index/padding 引用变量', '新增变量：--space-0-75(3px)、--z-tooltip(1000)', '管理员面板新增"系统文档"页签，集中展示设计文档和功能文档'] },
  { date: '2026-06-20', items: ['修复地图加载数据错位问题，并重新做了一次安全的体积压缩（china-cities.json 413万→65.7万字节，china-provinces-outline.json 130万→21.7万字节，几何精度损失小于1%，城市/省份零丢失）', '修复地图省份提示框浮在管理员等弹窗上方的问题', 'z-index 层级体系化：新建统一的语义化层级变量，修正统计面板/折叠胶囊与城市详情抽屉之间的层级混乱（折叠胶囊展开后跑到详情页下层、新打开的表单被胶囊遮挡等问题）'] },
  { date: '2026-06-20', items: ['字号体系化：建立完整字号梯度变量，替换44处硬编码值，仅保留少数确认为单次出现的精确调校值（品牌大标题、统计面板次要变体等）', '阴影体系化：建立三档elevation梯度变量，统一统计胶囊此前独有的内嵌高光拟物效果为扁平投影，修正其与卡片/弹窗/抽屉等组件之间的视觉风格不一致问题', '过渡曲线升级：标准缓动改用业内常见的Material Design贝塞尔曲线，交互更利落', '移除一处多余的!important声明（已验证导入预览报错提示样式无影响）', '修正搜索结果浮层层级归属、页签组件圆角变量误用间距变量的问题'] },
  { date: '2026-06-19', items: ['UI规范整理：按钮、页签、列表项样式统一', '颜色变量化：glass效果、阴影、边框等硬编码颜色替换为CSS变量', '间距变量化：4-48px常用尺寸替换为CSS变量', '新增系统升级记录页签'] },
  { date: '2026-06-19', items: ['修复用户名/昵称/省份/城市筛选框拼音模糊匹配（用户名昵称为新增，引入 pinyin-pro 实时转换）', '地图省界轮廓线变细，缓解移动端发黑发粗的问题', '修复移动端地图双指缩放/拖拽卡顿（touchmove 改为 rAF 帧节流）', 'CSS 设计 token 体系化：圆角按用途分层（面板 12px / 控件 8px）、交互过渡与状态强度（hover/active/disabled）统一为语义变量，修正多处字重与圆角跟规范不一致的问题，操作按钮组（.actions）统一靠右对齐'] },
];
type DocItem = { category: string; title: string; url?: string; action?: string; last_updated: string; description: string; };
const DOC_LIST: DocItem[] = [
  { category: '设计文档', title: '设计系统文档', url: '/cityprint/docs/设计系统-2026-06-20.md', last_updated: '2026-06-20', description: '完整设计 token 体系、组件规范' },
  { category: '功能文档', title: '功能现状文档', url: '/cityprint/docs/功能现状-2026-06-19.md', last_updated: '2026-06-19', description: '项目功能清单与现状说明' },
  { category: '协作文档', title: '协作者指南', url: '/cityprint/docs/协作者指南-2026-06-20.md', last_updated: '2026-06-20', description: '文档维护规则、更新流程' },
  { category: '升级记录', title: '系统升级记录', action: 'changelog', last_updated: '2026-06-20', description: '历次更新内容与变更记录' },
];
const PROVINCE_PINYIN: Record<string, string> = {
  北京: 'beijing',
  天津: 'tianjin',
  河北: 'hebei',
  山西: 'shanxi',
  内蒙古: 'neimenggu',
  辽宁: 'liaoning',
  吉林: 'jilin',
  黑龙江: 'heilongjiang',
  上海: 'shanghai',
  江苏: 'jiangsu',
  浙江: 'zhejiang',
  安徽: 'anhui',
  福建: 'fujian',
  江西: 'jiangxi',
  山东: 'shandong',
  河南: 'henan',
  湖北: 'hubei',
  湖南: 'hunan',
  广东: 'guangdong',
  广西: 'guangxi',
  海南: 'hainan',
  重庆: 'chongqing',
  四川: 'sichuan',
  贵州: 'guizhou',
  云南: 'yunnan',
  西藏: 'xizang',
  陕西: 'shaanxi',
  甘肃: 'gansu',
  青海: 'qinghai',
  宁夏: 'ningxia',
  新疆: 'xinjiang',
  台湾: 'taiwan',
  香港: 'xianggang',
  澳门: 'aomen',
};

function normalize(value: unknown) {
  return String(value ?? '').trim();
}

function dateValue(value: unknown) {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === 'number') {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed) return `${parsed.y}-${String(parsed.m).padStart(2, '0')}-${String(parsed.d).padStart(2, '0')}`;
  }
  return normalize(value).replace(/\//g, '-');
}

function numberValue(value: unknown) {
  const n = Number(normalize(value));
  return Number.isFinite(n) ? n : NaN;
}

function isValidDateText(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function findCity(province: string, city: string) {
  const shortProvince = province.replace(/省|市|自治区|特别行政区|壮族|回族|维吾尔/g, '');
  const shortCity = city.replace(/市|地区|自治州|盟/g, '');
  return CITIES.find((item) => item.province === shortProvince && item.city_name === shortCity)
    ?? CITIES.find((item) => item.province === shortProvince && (item.city_name.includes(shortCity) || shortCity.includes(item.city_name)));
}

function writeAdminWorkbook(filename: string, rows: Array<Record<string, string | number | undefined>>) {
  const worksheet = XLSX.utils.json_to_sheet(rows, { header: ['用户名', '昵称', '省份', '城市', '停留天数', '最后停留日期', '备注', '更新时间'] });
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, '访问记录');
  XLSX.writeFile(workbook, filename);
}

export default function AdminPanel({ embedded = false }: { embedded?: boolean }) {
  const users = useStore((state) => state.users);
  const setAdminOpen = useStore((state) => state.setAdminOpen);
  const deleteUserAndData = useStore((state) => state.deleteUserAndData);
  const resetUserPassword = useStore((state) => state.resetUserPassword);
  const updateAnyUserName = useStore((state) => state.updateAnyUserName);
  const getSystemStats = useStore((state) => state.getSystemStats);
  const [pendingReset, setPendingReset] = useState<{ userId: string; name: string } | null>(null);
  const [resetPw, setResetPw] = useState('');
  const [resetConfirm, setResetConfirm] = useState('');
  const [names, setNames] = useState<Record<string, string>>({});
  /* 2026-06-21: 移动端用户卡片"修改昵称"交互专用——记录当前正在编辑昵称
     的用户id，null表示没有任何卡片处于编辑态。PC端表格沿用原有的失焦
     保存模式不受影响，移动端用明确的"修改→保存/取消"交互，因为移动端
     没有PC端"点输入框直接改、点别处自动保存"的隐含习惯。 */
  const [editingNameId, setEditingNameId] = useState<string | null>(null);
  /* 2026-06-21: 移动端批量删除交互（第二版，替换第一版"长按直接删除单个"
     方案——真机测试发现长按会跟浏览器原生的"选择文本/分享"菜单冲突，且
     用户提出更完整的方案：长按进入多选模式，勾选若干个后统一删除，是
     更标准的批量操作交互，业内邮箱/相册/文件管理器都是这套模式）。
     selectionMode: 是否处于多选态。selectedIds: 当前已勾选的用户id集合。
     pendingDelete改为承载"待确认批量删除的用户列表"(单个删除也走同一个
     modal，传入长度为1的数组即可，不再需要两套确认逻辑)。
     longPressTimer/longPressTriggered配合阻止浏览器原生长按菜单——
     原生菜单是长按选中文本/呼出分享时触发的，跟我们自己的setTimeout
     长按检测同时存在会冲突，需要在长按命中时主动preventDefault。 */
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [pendingDelete, setPendingDelete] = useState<{ userId: string; name: string }[] | null>(null);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressTriggered = useRef(false);
  const [newUsername, setNewUsername] = useState('');
  const [newNickname, setNewNickname] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [stats, setStats] = useState({ totalUsers: users.length, totalVisits: 0, adminUsers: 0 });
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [adminTab, setAdminTab] = useState<'users' | 'data' | 'docs'>('users');
  const [showChangelog, setShowChangelog] = useState(false);
  const [allVisits, setAllVisits] = useState<AdminVisitExportRow[]>([]);
  const [filterUsername, setFilterUsername] = useState('');
  const [filterName, setFilterName] = useState('');
  const [filterProvince, setFilterProvince] = useState('');
  const [filterCity, setFilterCity] = useState('');
  const [appliedFilters, setAppliedFilters] = useState({
    username: '',
    name: '',
    province: '',
    city: '',
  });
  const [ledgerPage, setLedgerPage] = useState(1);
  const [showImportTools, setShowImportTools] = useState(false);
  const [targetUserId, setTargetUserId] = useState(users[0]?.id ?? '');
  const [importPreview, setImportPreview] = useState<ImportVisitRow[]>([]);
  const importFileRef = useRef<HTMLInputElement>(null);

  const cityById = useMemo(() => new Map(CITIES.map((city) => [city.city_id, city])), []);
  const targetUser = users.find((user) => user.id === targetUserId);
  const usernameOptions = useMemo(() => {
    return Array.from(new Set(allVisits.map((visit) => visit.username).filter(Boolean)))
      .sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'));
  }, [allVisits]);
  const usernamePinyinMap = useMemo(() => buildPinyinMap(usernameOptions), [usernameOptions]);
  const nameOptions = useMemo(() => {
    return Array.from(new Set(allVisits.map((visit) => visit.name).filter(Boolean)))
      .sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'));
  }, [allVisits]);
  const namePinyinMap = useMemo(() => buildPinyinMap(nameOptions), [nameOptions]);
  const provinceOptionsList = useMemo(() => {
    return Array.from(new Set(CITIES.map((city) => city.province))).sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'));
  }, []);
  const cityOptionsList = useMemo(() => {
    const selectedProvince = CITIES.some((city) => city.province === filterProvince) ? filterProvince : '';
    return CITIES
      .filter((city) => !selectedProvince || city.province === selectedProvince)
      .map((city) => city.city_name)
      .sort((a, b) => a.localeCompare(b, 'zh-Hans-CN'));
  }, [filterProvince]);
  const cityPinyinMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const city of CITIES) {
      map[city.city_name] = city.pinyin;
    }
    return map;
  }, []);
  const ledgerVisits = useMemo(() => {
    const usernameQuery = appliedFilters.username.trim().toLowerCase();
    const nameQuery = appliedFilters.name.trim().toLowerCase();
    const provinceQuery = appliedFilters.province.trim();
    const cityQuery = appliedFilters.city.trim();
    return allVisits
      .filter((visit) => {
        const city = cityById.get(visit.city_id);
        if (usernameQuery && !(visit.username ?? '').toLowerCase().includes(usernameQuery)) return false;
        if (nameQuery && !(visit.name ?? '').toLowerCase().includes(nameQuery)) return false;
        if (provinceQuery && city?.province !== provinceQuery) return false;
        if (cityQuery && city?.city_name !== cityQuery) return false;
        return true;
      })
      .sort((a, b) => {
        return b.updated_at.localeCompare(a.updated_at);
      });
  }, [allVisits, appliedFilters, cityById]);
  const totalLedgerPages = Math.max(1, Math.ceil(ledgerVisits.length / LEDGER_PAGE_SIZE));
  const pagedVisits = useMemo(() => {
    const start = (ledgerPage - 1) * LEDGER_PAGE_SIZE;
    return ledgerVisits.slice(start, start + LEDGER_PAGE_SIZE);
  }, [ledgerPage, ledgerVisits]);

  useEffect(() => {
    setLedgerPage(1);
  }, [appliedFilters]);

  useEffect(() => {
    void getSystemStats().then(setStats);
  }, [getSystemStats, users.length]);

  useEffect(() => {
    setNames(Object.fromEntries(users.map((user) => [user.id, user.name])));
  }, [users]);

  useEffect(() => {
    if (!targetUserId && users[0]) setTargetUserId(users[0].id);
    if (targetUserId && !users.some((user) => user.id === targetUserId)) setTargetUserId(users[0]?.id ?? '');
  }, [targetUserId, users]);

  useEffect(() => {
    if (adminTab !== 'data' || users.length === 0) return;
    void adminExportVisits(users.map((user) => user.id)).then((data) => setAllVisits(data.visits));
  }, [adminTab, users]);

  const handleCreateUser = async () => {
    const username = newUsername.trim();
    const name = newNickname.trim();
    if (!username || !name || !newPassword) {
      useStore.getState().showToast({ icon: '!', message: '请填写所有字段' });
      return;
    }
    await createUser(name, { username, password: newPassword, is_admin: false });
    setNewUsername('');
    setNewNickname('');
    setNewPassword('');
    setShowCreateModal(false);
    const refreshed = await getUsers();
    useStore.setState({ users: refreshed, toast: { icon: '✓', message: '用户已创建' } });
    void getSystemStats().then(setStats);
  };

  const handleResetPassword = async () => {
    if (!pendingReset) return;
    if (resetPw.length < 6) {
      useStore.getState().showToast({ icon: '!', message: '密码至少6位' });
      return;
    }
    if (resetPw !== resetConfirm) {
      useStore.getState().showToast({ icon: '!', message: '两次密码不一致' });
      return;
    }
    await resetUserPassword(pendingReset.userId, resetPw);
    setPendingReset(null);
    setResetPw('');
    setResetConfirm('');
  };

  /* 2026-06-21: 原用window.confirm()做确认，是浏览器原生弹窗、样式无法
     定制、跟项目自己的modal设计完全不统一。删除确认统一改用项目自己的
     modal样式(参照"重置密码"modal-sm模板)。pendingDelete现在是数组，
     桌面端单个删除传长度为1的数组，移动端批量删除传选中的全部用户，
     共用同一个modal和同一个confirmDeleteUser，不需要两套确认逻辑。 */
  const removeUser = (id: string) => {
    const user = users.find((u) => u.id === id);
    if (user) setPendingDelete([{ userId: id, name: user.name }]);
  };

  const confirmDeleteUser = () => {
    if (!pendingDelete) return;
    pendingDelete.forEach((item) => void deleteUserAndData(item.userId));
    setPendingDelete(null);
    setSelectionMode(false);
    setSelectedIds(new Set());
  };

  /* 2026-06-21: 移动端"长按进入多选模式"交互（第三版修复）。真机测试
     发现：①浏览器"手动标记广告"/划词工具栏菜单依然弹出——根因是上一版
     onContextMenu只能拦截右键菜单事件，移动端长按触发的是另一套系统级
     文本选择/菜单行为，必须在touchstart时就调用event.preventDefault()
     才能真正拦住（之前的处理函数都没接收原生事件参数、没调用过
     preventDefault，onContextMenu的return false在新版React里根本不
     生效）。②"手指多拨动一下页面就关闭了"——是浏览器的"边缘滑动返回
     上一页"系统手势被触发，需要在touchmove时也阻止默认行为，但不能
     无差别阻止——必须先用阈值区分"真的在滚动列表"还是"长按时手指轻微
     抖动"，否则用户长按时手指完全不动几乎不可能，体验会很差；阈值内的
     小幅移动允许继续计时，超出阈值才视为"取消长按、走滚动"，此时才放行
     默认行为（不阻止，让用户能正常滚动列表）。
     touchStartPos记录按下时的坐标，用于touchmove时计算位移量。 */
  const touchStartPos = useRef<{ x: number; y: number } | null>(null);
  const LONG_PRESS_MOVE_THRESHOLD = 10; // px，超出则视为滚动而不是长按抖动

  /* 2026-06-21: is_admin/selectionMode的拦截已经在JSX层处理（多选模式
     下和管理员卡片完全不绑定这些事件props），这里不再重复判断
     selectionMode——保留is_admin判断是因为这是函数自身逻辑的一部分
     （管理员永远不该进多选），但selectionMode属于"调用方该不该调用我"
     的范畴，不应该让函数自己再判断一遍调用时机，否则两处逻辑分散、
     不容易看出真正生效的是哪一层。 */
  const handleLongPressStart = (event: ReactTouchEvent | ReactMouseEvent, user: { id: string; name: string; is_admin: boolean }) => {
    if (user.is_admin) return;
    // 2026-06-21修复: 每次新的按下都先彻底清掉上一次可能残留的计时器，
    // 防止"长按A(被is_admin拦截，定时器从未启动)→长按B"这种连续操作下
    // 出现任何潜在的状态竞争——不依赖猜测具体哪一步残留了什么，直接在
    // 起点保证这次是完全干净的状态。
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
    if ('touches' in event) {
      const touch = event.touches[0];
      touchStartPos.current = { x: touch.clientX, y: touch.clientY };
    }
    longPressTriggered.current = false;
    longPressTimer.current = setTimeout(() => {
      longPressTriggered.current = true;
      longPressTimer.current = null;
      setSelectionMode(true);
      setSelectedIds(new Set([user.id]));
      // 长按命中的瞬间阻止默认行为，避免系统紧接着弹出选择文本/划词菜单。
      event.preventDefault?.();
    }, 500);
  };

  const handleLongPressMove = (event: ReactTouchEvent) => {
    if (!touchStartPos.current || !longPressTimer.current) return;
    const touch = event.touches[0];
    const dx = Math.abs(touch.clientX - touchStartPos.current.x);
    const dy = Math.abs(touch.clientY - touchStartPos.current.y);
    if (dx > LONG_PRESS_MOVE_THRESHOLD || dy > LONG_PRESS_MOVE_THRESHOLD) {
      // 超出阈值视为真实滚动/滑动，取消长按计时，并主动不调用
      // preventDefault——放行默认行为，让浏览器正常处理滚动或边缘返回手势，
      // 不要在用户明确是在滑动时还去拦截系统手势。
      handleLongPressEnd();
    }
  };

  const handleLongPressEnd = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
    touchStartPos.current = null;
  };

  const toggleSelected = (userId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      // 全部取消勾选后自动退出多选模式，作为"取消"按钮的补充，不强制
      // 用户一定要点按钮才能退出。
      if (next.size === 0) setSelectionMode(false);
      return next;
    });
  };

  const exitSelectionMode = () => {
    setSelectionMode(false);
    setSelectedIds(new Set());
  };

  const handleBatchDelete = () => {
    const targets = users.filter((u) => selectedIds.has(u.id)).map((u) => ({ userId: u.id, name: u.name }));
    if (targets.length > 0) setPendingDelete(targets);
  };

  /* 2026-06-26: PC端用户名从失焦自动保存(handleNameBlur)改为按钮式“修改→
     保存/取消”后，handleNameBlur不再被调用，已删除。下handleNameSave/
     handleNameCancel现是PC端和移动端共享的唯一保存/取消逻辑。 */

  /* 2026-06-21: 移动端卡片"保存"按钮专用，复用PC端同一个updateAnyUserName
     接口，不另写一套保存逻辑——区别只在触发方式（明确点击保存，而不是
     失焦自动保存）。 */
  const handleNameSave = (userId: string) => {
    const currentName = names[userId];
    const originalName = users.find((u) => u.id === userId)?.name;
    if (currentName !== undefined && currentName !== originalName) {
      void updateAnyUserName(userId, currentName);
    }
    setEditingNameId(null);
  };

  const handleNameCancel = (userId: string, originalName: string) => {
    setNames({ ...names, [userId]: originalName });
    setEditingNameId(null);
  };

  const downloadCurrentLedger = () => {
    writeAdminWorkbook('城市足迹当前视图.xlsx', ledgerVisits.map((visit) => {
      const city = cityById.get(visit.city_id);
      return {
        用户名: visit.username,
        昵称: visit.name,
        省份: city?.province ?? '',
        城市: city?.city_name ?? visit.city_id,
        停留天数: visit.duration_days,
        最后停留日期: visit.last_stay_date,
        备注: visit.notes ?? '',
        更新时间: visit.updated_at.slice(0, 10),
      };
    }));
    useStore.getState().showToast({ icon: '✓', message: `已导出 ${ledgerVisits.length} 条访问记录` });
  };

  const downloadAdminTemplate = () => {
    writeAdminWorkbook('城市足迹导入模板.xlsx', [{
      用户名: targetUser?.username ?? '',
      昵称: targetUser?.name ?? '',
      省份: '广东',
      城市: '广州',
      停留天数: 365,
      最后停留日期: '2024-01-01',
      备注: '示例',
    }]);
  };

  const onImportFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!targetUserId) {
      useStore.getState().showToast({ icon: '!', message: '请选择导入目标用户' });
      event.target.value = '';
      return;
    }

    const [workbook, existingData] = await Promise.all([
      file.arrayBuffer().then((buffer) => XLSX.read(buffer, { type: 'array', cellDates: true })),
      adminExportVisits([targetUserId]),
    ]);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const records = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet);
    const existingCityIds = new Set(existingData.visits.map((visit) => visit.city_id));
    const seenCityIds = new Set<string>();

    setImportPreview(records.map((record) => {
      const province = normalize(record['省份']);
      const city = normalize(record['城市']);
      const duration_days = numberValue(record['停留天数']);
      const last_stay_date = dateValue(record['最后停留日期']);
      const notesValue = normalize(record['备注']);
      const matched = city ? findCity(province, city) : undefined;
      const row: ImportVisitRow = { province, city, duration_days, last_stay_date, notes: notesValue || undefined, city_id: matched?.city_id };
      if (!city) row.error = '城市必填';
      else if (!matched) row.error = '城市未匹配';
      else if (!Number.isFinite(duration_days) || !Number.isInteger(duration_days) || duration_days < 1) row.error = '停留天数无效';
      else if (!isValidDateText(last_stay_date)) row.error = '日期无效';
      else if (existingCityIds.has(matched.city_id)) row.error = '城市已存在';
      else if (seenCityIds.has(matched.city_id)) row.error = '文件内重复';
      if (matched) seenCityIds.add(matched.city_id);
      return row;
    }));
    event.target.value = '';
  };

  const confirmAdminImport = async () => {
    if (!targetUserId) {
      useStore.getState().showToast({ icon: '!', message: '请选择导入目标用户' });
      return;
    }
    const validRows = importPreview.filter((row) => !row.error && row.city_id);
    const result = await adminImportVisits(targetUserId, validRows.map((row) => ({
      city_id: row.city_id as string,
      duration_days: row.duration_days,
      last_stay_date: row.last_stay_date,
      notes: row.notes,
    })));
    setImportPreview([]);
    useStore.getState().showToast({ icon: '✓', message: `已导入 ${result.inserted_count} 条访问记录` });
    void getSystemStats().then(setStats);
    if (adminTab === 'data') {
      void adminExportVisits(users.map((user) => user.id)).then((data) => setAllVisits(data.visits));
    }
  };

  const content = (
    <>
      <div className="mode-pill mb-20">
        <button className={adminTab === 'users' ? 'active' : ''} onClick={() => setAdminTab('users')}>用户管理</button>
        <button className={adminTab === 'data' ? 'active' : ''} onClick={() => setAdminTab('data')}>数据管理</button>
        <button className={adminTab === 'docs' ? 'active' : ''} onClick={() => setAdminTab('docs')}>系统文档</button>
      </div>

      {/* 2026-06-21: 数字卡片(总用户/管理员/总访问)和"新增用户"按钮挪到
         .admin-tab-viewport外面，固定在顶部不随下方用户列表滚动——用户
         反馈"列表滚动时希望这些汇总信息和新增按钮保持可见"。只在
         adminTab==='users'时显示，不影响数据管理/系统文档两个tab。
         注意：不能挪到viewport内部再单独加一层sticky，那样容易跟viewport
         本身的overflow:auto重演"外层内层抢滚动权"的问题（之前修复tab切换
         高度跳动时已经踩过这个坑）——直接放在viewport外部、tab按钮同级，
         是更简单可靠的"不参与滚动"方案。 */}
      {adminTab === 'users' && (
        <>
          <div className="admin-stats">
            <div className="stat"><span className="label-sm">总用户</span><strong>{stats.totalUsers}</strong></div>
            <div className="stat"><span className="label-sm">管理员</span><strong>{stats.adminUsers}</strong></div>
            <div className="stat"><span className="label-sm">总访问</span><strong>{stats.totalVisits}</strong></div>
          </div>
          {/* 2026-06-21: 移动端多选模式下，"新增用户"切换为"取消"+
             "删除用户(已选N个)"。桌面端不会触发长按多选(走表格而非
             卡片)，所以桌面端的"新增用户"按钮始终显示，用desktop-only
             包裹；移动端用selectionMode分叉显示哪一组按钮。 */}
          <div className="mb-16 desktop-only">
            <button className="btn-primary" onClick={() => setShowCreateModal(true)}>+ 新增用户</button>
          </div>
          <div className="mb-16 mobile-only">
            {selectionMode ? (
              <div className="admin-selection-bar">
                <button className="btn-outline" onClick={exitSelectionMode}>取消</button>
                <button
                  className="btn-danger"
                  disabled={selectedIds.size === 0}
                  onClick={handleBatchDelete}
                >
                  删除用户{selectedIds.size > 0 ? `（已选${selectedIds.size}个）` : ''}
                </button>
              </div>
            ) : (
              <button className="btn-primary" onClick={() => setShowCreateModal(true)}>+ 新增用户</button>
            )}
          </div>
        </>
      )}

      {/* 2026-06-21: 之前用min-height硬撑"系统文档"tab去对齐另外两个tab的
         高度，但用户管理/数据管理的表格内容随实际用户数/访问记录数动态变化
         （当前测试数据只有4个用户，未来会增长），固定min-height只是凑了
         当下的数字，用户数一多依然会跳。改用更稳健的方案：tab按钮固定在
         外面不滚动，三个tab的内容统一包进.admin-tab-viewport（固定高度+
         内部overflow:auto），这样无论内容多少，外层弹窗高度永远不变，
         滚动发生在内容区域内部，根治"切tab高度跳动"问题，不依赖猜测的
         固定数值。 */}
      <div className="admin-tab-viewport">

      {adminTab === 'users' && (
        <>
          {/* 2026-06-21: 桌面端表格保持不变。移动端(768px以下)改用卡片列表
             ——根因排查发现.data-table设了min-width:720px，是桌面表格的
             设计思路，移动端完全没有专属断点处理，导致表格被硬塞进手机屏幕、
             靠横向滚动适配，文字相对显得小、操作按钮也要滚动才能点到。
             用户截图标注确认方向：调整箭头指向的用户列表（往大调），而不是
             调小圈出的数字卡片/Tab按钮（那两处被多个场景复用，风险更大）。
             两套结构通过.desktop-only/.mobile-only配合CSS媒体查询切换显示，
             不用JS判断设备类型，符合项目现有的响应式风格。 */}
          {/* 2026-06-21: 桌面表格三处整改：①用户名+@username合并同一行
             （baseline对齐），不再纵向堆叠撑高每行；②"密码"独立列(仅含重置
             密码按钮)与"操作"独立列(仅含删除按钮)合并为统一的"操作"列，
             不再让同一组对用户的操作分散在两个不相邻的列里；③.users-table-wrap
             固定高度+内部滚动，配合.data-table th的sticky，让表头无论数据
             量多少都保持可见，不依赖用户数将来是否增长到产生滚动的程度。 */}
          {/* 2026-06-27: 改用通用Table组件(scroll="fill")替代手写
             table结构。父级.admin-tab-viewport是flex容器，本表格需要
             占满它分配的剩余空间而不是用孤立的固定像素值——这正是
             Table组件scroll='fill'模式存在的原因，机制跟之前手写的
             .users-table-wrap完全一致，只是改名为通用的.table-wrap--fill。 */}
          <Table
            wrapClassName="desktop-only"
            scroll="fill"
            rowKey={(user) => user.id}
            data={users}
            columns={[
              {
                key: 'name',
                header: '用户',
                render: (user) => {
                  const isEditing = editingNameId === user.id;
                  /* 2026-06-26: 用户名从内联输入框改为按钮式"修改→保存/
                     取消"，跟移动端卡片的交互完全一致（不依赖PC端才有的
                     "失焦自动保存"隐含习惯），复用同一套editingNameId/
                     handleNameSave/handleNameCancel状态和逻辑，不另写
                     一套。非编辑态显示用户名+@username；编辑态显示输入框，
                     保存/取消按钮挪到"操作"列跟重置密码/删除放在一起。 */
                  return isEditing ? (
                    <input
                      className="input"
                      value={names[user.id] ?? user.name}
                      onChange={(event) => setNames({ ...names, [user.id]: event.target.value })}
                      placeholder="用户名称"
                      autoFocus
                    />
                  ) : (
                    <div className="user-name-cell">
                      <span>{names[user.id] ?? user.name}</span>
                      {user.username && <span className="muted">@{user.username}</span>}
                    </div>
                  );
                },
              },
              { key: 'type', header: '类型', render: (user) => (user.is_admin ? '管理员' : '普通用户') },
              { key: 'created', header: '创建时间', render: (user) => user.created_at.slice(0, 10) },
              {
                key: 'actions',
                header: '操作',
                render: (user) => {
                  const isEditing = editingNameId === user.id;
                  return (
                    <div className="row-actions">
                      {isEditing ? (
                        <>
                          <button className="btn-primary compact" onClick={() => handleNameSave(user.id)}>保存</button>
                          <button className="btn-outline compact" onClick={() => handleNameCancel(user.id, user.name)}>取消</button>
                        </>
                      ) : (
                        <>
                          <button className="btn-tertiary" onClick={() => setEditingNameId(user.id)}>修改昵称</button>
                          <button className="btn-tertiary" onClick={() => { setPendingReset({ userId: user.id, name: user.name }); setResetPw(''); setResetConfirm(''); }}>重置密码</button>
                          {!user.is_admin && <button className="btn-tertiary-danger" onClick={() => removeUser(user.id)}>删除</button>}
                        </>
                      )}
                    </div>
                  );
                },
              },
            ]}
          />

          <div className="admin-user-cards mobile-only">
            {users.map((user) => {
              const isEditing = editingNameId === user.id;
              const isChecked = selectedIds.has(user.id);
              /* 2026-06-21: 多选模式下，整卡点击=切换勾选（管理员账号
                 例外，不响应点击）；非多选模式下，长按进入多选，普通
                 点击不绑定在卡片本身（点"修改"/按钮各自触发）。
                 longPressTriggered用于区分"这次touchend/click是长按
                 松手后的尾随事件，还是真正的点击"——长按命中后会把
                 triggered设为true，这里检测到就直接return不处理点击，
                 避免长按进多选模式的同时又触发了一次勾选切换。 */
              /* 2026-06-21: 多选模式下彻底不绑定任何长按相关事件（不是
                 "绑定了但函数内部return"，是压根不传这些props）——用户
                 明确要求"多选状态下没有长按这件事"，要的是干净利落、没有
                 任何长按响应的暧昧空间，不只是行为上没反应。 */
              const handleCardClick = () => {
                if (longPressTriggered.current) {
                  longPressTriggered.current = false;
                  return;
                }
                if (selectionMode && !user.is_admin) toggleSelected(user.id);
              };
              return (
                <div
                  key={user.id}
                  className={`admin-user-card${isEditing || selectionMode ? '' : ' is-interactive'}${selectionMode && isChecked ? ' is-checked' : ''}`}
                  onTouchStart={user.is_admin || selectionMode ? undefined : (e) => handleLongPressStart(e, user)}
                  onTouchEnd={user.is_admin || selectionMode ? undefined : handleLongPressEnd}
                  onTouchMove={user.is_admin || selectionMode ? undefined : handleLongPressMove}
                  onMouseDown={user.is_admin || selectionMode ? undefined : (e) => handleLongPressStart(e, user)}
                  onMouseUp={user.is_admin || selectionMode ? undefined : handleLongPressEnd}
                  onMouseLeave={user.is_admin || selectionMode ? undefined : handleLongPressEnd}
                  onContextMenu={(e) => e.preventDefault()}
                  onClick={handleCardClick}
                >
                  {selectionMode ? (
                    <div className="admin-user-card-select-row">
                      <span className={`admin-user-card-checkbox${isChecked ? ' is-checked' : ''}${user.is_admin ? ' is-disabled' : ''}`}>
                        {isChecked && <Icon name="check" />}
                      </span>
                      {/* 2026-06-21: 多选行原来只显示昵称，补充显示用户名
                         (@username)解决重名分不清的问题。昵称+用户名同一行
                         横排显示（更紧凑），标签推到最右侧对齐。 */}
                      <div className="admin-user-card-select-info">
                        <div className="admin-user-card-select-text">
                          <span className="admin-user-card-name">{user.name}</span>
                          {user.username && <span className="admin-user-card-select-username">@{user.username}</span>}
                        </div>
                        <span className={`admin-user-card-tag${user.is_admin ? ' is-admin' : ''}`}>{user.is_admin ? '管理员' : '普通用户'}</span>
                      </div>
                    </div>
                  ) : isEditing ? (
                    <>
                      <div className="edit-input-row">
                        <input
                          className="input edit-input"
                          value={names[user.id] ?? user.name}
                          onChange={(event) => setNames({ ...names, [user.id]: event.target.value })}
                          placeholder="用户名称"
                          autoFocus
                        />
                      </div>
                      <div className="card-btn-row">
                        <button className="btn-primary compact" onClick={() => handleNameSave(user.id)}>保存</button>
                        <button className="btn-outline compact" onClick={() => handleNameCancel(user.id, user.name)}>取消</button>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="admin-user-card-head">
                        <div className="admin-user-card-name-row">
                          <span className="admin-user-card-name">{names[user.id] ?? user.name}</span>
                          <button className="btn-tertiary" onClick={() => setEditingNameId(user.id)}>修改</button>
                        </div>
                        <span className={`admin-user-card-tag${user.is_admin ? ' is-admin' : ''}`}>{user.is_admin ? '管理员' : '普通用户'}</span>
                      </div>
                      <div className="admin-user-card-meta">
                        {user.username && `@${user.username} · `}创建于 {user.created_at.slice(0, 10)}
                      </div>
                      {/* 2026-06-21: 常驻"删除"按钮移除（改为长按进入多选批量
                         删除），只剩"重置密码"——不再需要撑满整行的
                         card-btn-row布局，改为靠左、宽度刚好包裹文字的
                         紧凑按钮(admin-user-card-action)。非管理员账号
                         卡片下方提示"长按可批量删除"，告知这个隐藏交互
                         的存在。 */}
                      <div className="admin-user-card-footer">
                        <button className="btn-tertiary" onClick={() => { setPendingReset({ userId: user.id, name: user.name }); setResetPw(''); setResetConfirm(''); }}>重置密码</button>
                        {!user.is_admin && <span className="admin-user-card-hint">长按可批量删除</span>}
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}

      {adminTab === 'data' && (
        <div>
          <div className="flex-start flex-wrap gap-8 mb-8">
            <div className="col-username">
              <FuzzySelect
                options={usernameOptions}
                searchKeys={usernamePinyinMap}
                value={filterUsername}
                onChange={setFilterUsername}
                onSelect={setFilterUsername}
                placeholder="搜索选择用户名"
              />
            </div>
            <div className="col-username">
              <FuzzySelect
                options={nameOptions}
                searchKeys={namePinyinMap}
                value={filterName}
                onChange={setFilterName}
                onSelect={setFilterName}
                placeholder="搜索选择昵称"
              />
            </div>
            <div className="col-username">
              <FuzzySelect
                options={provinceOptionsList}
                searchKeys={PROVINCE_PINYIN}
                value={filterProvince}
                onChange={setFilterProvince}
                onSelect={setFilterProvince}
                placeholder="搜索选择省份"
              />
            </div>
            <div className="col-nickname">
              <FuzzySelect
                options={cityOptionsList}
                searchKeys={cityPinyinMap}
                value={filterCity}
                onChange={setFilterCity}
                onSelect={setFilterCity}
                placeholder="搜索选择城市"
              />
            </div>
          </div>
          <div className="actions flex-wrap mb-12">
            <button
              className="btn-primary"
              onClick={() => setAppliedFilters({
                username: filterUsername,
                name: filterName,
                province: filterProvince,
                city: filterCity,
              })}
            >
              <Icon name="search" /> 查询
            </button>
            <button className="btn-outline" onClick={downloadCurrentLedger}><Icon name="upload" /> 导出当前视图</button>
            <button className="btn-outline" onClick={() => setShowImportTools((value) => !value)}><Icon name="download" /> 导入数据</button>
            <button className="btn-outline" onClick={downloadAdminTemplate}><Icon name="download" /> 下载模板</button>
          </div>

          {showImportTools && (
            <div className="card p-16">
              <div className="form-row">
                <span className="label-sm">批量导入</span>
                <div className="form-grid-2">
                  <select className="input" value={targetUserId} onChange={(event) => { setTargetUserId(event.target.value); setImportPreview([]); }}>
                    {users.map((user) => (
                      <option key={user.id} value={user.id}>{user.username || user.name} · {user.name}</option>
                    ))}
                  </select>
                  <div className="actions">
                    <button className="btn-primary" disabled={!targetUserId} onClick={() => importFileRef.current?.click()}><Icon name="download" /> 选择文件</button>
                  </div>
                </div>
                <input ref={importFileRef} type="file" accept=".xlsx" hidden onChange={onImportFile} />
              </div>
            </div>
          )}

          {importPreview.length > 0 && (
            <div className="import-preview card">
              <div className="panel-title">
                <strong>导入预览</strong>
                <span className="muted">
                  ✅ 有效 {importPreview.filter((row) => !row.error).length} 行 / ⚠️ 跳过 {importPreview.filter((row) => row.error === '城市已存在' || row.error === '文件内重复').length} 行 / ❌ 错误 {importPreview.filter((row) => row.error && row.error !== '城市已存在' && row.error !== '文件内重复').length} 行
                </span>
              </div>
              {/* 2026-06-27: 改用通用ImportPreviewTable组件，跟UserProfile.tsx
                 的访问记录导入预览共用同一份实现，不再各自维护一份几乎
                 一字不差的表格代码。 */}
              <ImportPreviewTable rows={importPreview} />
              <div className="actions mt-12">
                <button className="btn-primary" disabled={importPreview.every((row) => row.error)} onClick={() => void confirmAdminImport()}>确认导入</button>
                <button className="btn-outline" onClick={() => setImportPreview([])}>取消</button>
              </div>
            </div>
          )}

          {/* 2026-06-27: 改用通用Table组件，scroll保持'none'(沿用原状态，
             配合下方分页器，不在这次抽象里顺手新增sticky表头——那是另一条
             独立待办，等PC端断点问题排查完后再处理，不在这次混着做)。
             data传pagedVisits而不是ledgerVisits：分页后的当页数据本来就是
             实际渲染的内容，空状态判断在常规场景下跟原来对ledgerVisits判空
             是等价的。 */}
          <Table
            tableStyle={{ tableLayout: 'fixed', width: '100%' }}
            emptyText="暂无访问记录"
            data={pagedVisits}
            rowKey={(visit) => `${visit.user_id}-${visit.id}`}
            columns={[
              { key: 'username', header: '用户名', headerStyle: { width: '12%' }, render: (visit) => visit.username || visit.name },
              { key: 'name', header: '昵称', headerStyle: { width: '10%' }, render: (visit) => visit.name },
              { key: 'province', header: '省份', headerStyle: { width: '10%' }, render: (visit) => cityById.get(visit.city_id)?.province ?? '-' },
              { key: 'city', header: '城市', headerStyle: { width: '12%' }, render: (visit) => cityById.get(visit.city_id)?.city_name ?? visit.city_id },
              { key: 'duration', header: '停留天数', headerStyle: { width: '8%' }, render: (visit) => visit.duration_days },
              { key: 'lastStay', header: '最后停留', headerStyle: { width: '13%' }, render: (visit) => visit.last_stay_date },
              { key: 'notes', header: '备注', headerStyle: { width: '20%' }, render: (visit) => visit.notes || '-' },
              { key: 'updated', header: '更新时间', headerStyle: { width: '15%' }, render: (visit) => visit.updated_at.slice(0, 10) },
            ]}
          />

          {ledgerVisits.length > 0 && (
            <div className="actions flex-between flex-wrap mt-8">
              <span className="muted">
                共 {ledgerVisits.length} 条，当前第 {ledgerPage} / {totalLedgerPages} 页
              </span>
              <div className="actions">
                <button
                  className="btn-outline small"
                  disabled={ledgerPage <= 1}
                  onClick={() => setLedgerPage((page) => Math.max(1, page - 1))}
                >
                  上一页
                </button>
                <button
                  className="btn-outline small"
                  disabled={ledgerPage >= totalLedgerPages}
                  onClick={() => setLedgerPage((page) => Math.min(totalLedgerPages, page + 1))}
                >
                  下一页
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {adminTab === 'docs' && (
        <div className="changelog-list">
          {DOC_LIST.map((doc, i) => {
            const handleEntryClick = () => {
              if (doc.action === 'changelog') {
                setShowChangelog(true);
              } else {
                window.open(doc.url, '_blank', 'noopener,noreferrer');
              }
            };
            return (
              <div
                key={i}
                className="changelog-entry"
                role="button"
                tabIndex={0}
                onClick={handleEntryClick}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleEntryClick(); } }}
              >
                <div className="changelog-date">{doc.category} · 最后更新 {doc.last_updated}</div>
                <div className="changelog-body">
                  {doc.action === 'changelog' ? (
                    <a href="#" className="changelog-link" onClick={(e) => { e.preventDefault(); e.stopPropagation(); setShowChangelog(true); }}>{doc.title}</a>
                  ) : (
                    <a href={doc.url} target="_blank" rel="noopener noreferrer" className="changelog-link" onClick={(e) => e.stopPropagation()}>{doc.title}</a>
                  )}
                  <span className="changelog-desc">{' — '}{doc.description}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {pendingReset && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <section className="modal modal-sm">
            <div className="modal-head">
              <h2>重置密码 · {pendingReset.name}</h2>
              <button className="icon-btn" onClick={() => setPendingReset(null)}><Icon name="close" /></button>
            </div>
            <div className="stack gap-10 mb-16">
              <div className="form-row">
                <span className="label-sm">新密码</span>
                <input className="input" type="password" autoFocus value={resetPw} onChange={(e) => setResetPw(e.target.value)} placeholder="至少6位" />
              </div>
              <div className="form-row">
                <span className="label-sm">确认密码</span>
                <input className="input" type="password" value={resetConfirm} onChange={(e) => setResetConfirm(e.target.value)} placeholder="再次输入" onKeyDown={(e) => { if (e.key === 'Enter') void handleResetPassword(); }} />
              </div>
            </div>
            <div className="flex-end gap-8">
              <button className="btn-outline" onClick={() => setPendingReset(null)}>取消</button>
              <button className="btn-primary" onClick={() => void handleResetPassword()}>确认重置</button>
            </div>
          </section>
        </div>
      )}

      {/* 2026-06-21: 删除确认改用项目自己的modal样式，替代之前的
         window.confirm()原生弹窗——桌面端单个删除和移动端批量删除共用
         这一个modal，pendingDelete统一是数组（单个删除传长度1的数组），
         不需要两套确认逻辑。批量删除时汇总展示全部待删除用户名列表，
         让用户确认前能清楚看到具体删的是谁。 */}
      {pendingDelete && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <section className="modal modal-sm">
            <div className="modal-head">
              <h2>{pendingDelete.length > 1 ? `删除 ${pendingDelete.length} 个用户` : `删除用户 · ${pendingDelete[0].name}`}</h2>
              <button className="icon-btn" onClick={() => setPendingDelete(null)}><Icon name="close" /></button>
            </div>
            {pendingDelete.length > 1 && (
              <ul className="admin-delete-list mb-16">
                {pendingDelete.map((item) => <li key={item.userId}>{item.name}</li>)}
              </ul>
            )}
            <p className="mb-16">确定删除{pendingDelete.length > 1 ? '以上用户' : '该用户'}及其所有数据？此操作不可恢复。</p>
            <div className="flex-end gap-8">
              <button className="btn-outline" onClick={() => setPendingDelete(null)}>取消</button>
              <button className="btn-danger" onClick={confirmDeleteUser}>确认删除</button>
            </div>
          </section>
        </div>
      )}

      {showCreateModal && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <section className="modal">
            <div className="modal-head">
              <h2>新增用户</h2>
              <button className="icon-btn" onClick={() => setShowCreateModal(false)}><Icon name="close" /></button>
            </div>
            <div className="form-grid-2 mb-16">
              <input className="input" value={newUsername} onChange={(event) => setNewUsername(event.target.value)} placeholder="用户名" />
              <input className="input" value={newNickname} onChange={(event) => setNewNickname(event.target.value)} placeholder="昵称" />
              <input className="input" type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} placeholder="密码" />
            </div>
            <div className="flex-end gap-8">
              <button className="btn-outline" onClick={() => { setShowCreateModal(false); setNewUsername(''); setNewNickname(''); setNewPassword(''); }}>取消</button>
              <button className="btn-primary" onClick={() => void handleCreateUser()}>确认创建</button>
            </div>
          </section>
        </div>
      )}

      {showChangelog && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <section className="modal modal-wide">
            <div className="modal-head">
              <h2>系统升级记录</h2>
              <button className="icon-btn" onClick={() => setShowChangelog(false)}><Icon name="close" /></button>
            </div>
            <div className="changelog-list">
              {CHANGELOG.map((entry, i) => (
                <div key={i} className="changelog-entry">
                  <div className="changelog-date">{entry.date}</div>
                  <ul className="changelog-items">
                    {entry.items.map((item, j) => (
                      <li key={j}>{j + 1}. {item}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}
      </div>
    </>
  );

  if (embedded) return <div className="embedded-panel">{content}</div>;

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <section className="modal modal-admin" style={{ width: 'min(1280px, calc(100vw - 32px))', maxWidth: 'none' }}>
        <div className="modal-head">
          <h2>管理员面板</h2>
          <button className="icon-btn" onClick={() => setAdminOpen(false)}><Icon name="close" /></button>
        </div>
        {content}
      </section>
    </div>
  );
}
