"""
从 china-cities.json（市级 feature）精确 union 重新生成省级轮廓 GeoJSON，
确保省级轮廓 = 对应市级数据的精确几何并集，避免两份数据各自独立处理后产生
几何偏差。

【背景】2026-06-20 发现：全国视图下放大地图后，市级色块主图层和省界轮廓层
会出现持续性视觉错位。根因排查到 china-provinces-outline.json 当时并非由
china-cities.json 精确 union 生成，而是来自某次独立的处理流程，与市级数据
存在局部几何差异——例如海南省在两份文件里的 bbox 纬度最小值相差约0.12度。
这类局部差异即使很小，只要刚好落在全国地图的边界附近（海南/三沙恰好是
最南端），就会被放大成两个 ECharts series 坐标系初始投影比例的差异：两层
用的是同一个 dx/dy/zoom 像素增量广播，但各自坐标系到像素的映射比例不同，
导致视觉上对不齐，且 pinch 缩放后立刻可见、不需要累积触发。

【使用方法】
当 china-cities.json 内容更新后（增删城市、调整边界等），重新跑一次本脚本，
保证省级轮廓数据始终是市级数据的精确派生，不会再次出现两者脱节的情况：

    cd <项目根目录>
    python3 scripts/regen_province_outline.py

跑完后记得：
1. 用本文件末尾的自检输出，确认 34 个省份全部生成成功、无 MISSING
2. npx tsc --noEmit && npm run build 走一遍验证流程
3. 用 shapely 量化校验新旧版本/与市级数据的 bbox、IoU 差异（参考本次修复时
   使用的方法），不要仅凭目测判断几何是否吻合
4. 部署后让用户亲自缩放地图确认视觉效果，这一步无法用代码验证

【依赖】shapely（仅用到 shape / mapping / unary_union，标准用法）

直辖市/特别行政区（北京/天津/上海/重庆/港/澳）在市级图里 parent.adcode 指向
全国占位值(100000)而非自身省级 adcode，因为它们自身的市级 feature 的 adcode
本身就等于省级 adcode，需要用 MUNICIPALITY_ADCODES 特殊处理，不能单纯按
parent.adcode 分组。
"""
import json
from shapely.geometry import shape, mapping
from shapely.ops import unary_union

CITIES_PATH = 'public/geojson/china-cities.json'
OUTLINE_PATH = 'public/geojson/china-provinces-outline.json'

# 直辖市/特别行政区：市级 feature 自身的 adcode 即为省级 adcode
MUNICIPALITY_ADCODES = {110000, 120000, 310000, 500000, 810000, 820000}


def main():
    with open(CITIES_PATH, encoding='utf-8') as f:
        cities = json.load(f)

    with open(OUTLINE_PATH, encoding='utf-8') as f:
        old_outline = json.load(f)

    # 保留原有的省份 name/adcode 列表和顺序，只重新计算 geometry，
    # 避免因为遍历顺序变化导致 git diff 噪音过大
    province_order = [
        (f['properties']['adcode'], f['properties']['name'])
        for f in old_outline['features']
    ]

    # 按省份 adcode 分组市级 feature
    by_province = {}
    for f in cities['features']:
        adcode = f['properties'].get('adcode')
        parent_adcode = (f['properties'].get('parent') or {}).get('adcode')
        if adcode in MUNICIPALITY_ADCODES:
            by_province.setdefault(adcode, []).append(f)
        elif parent_adcode and parent_adcode != 100000:
            by_province.setdefault(parent_adcode, []).append(f)

    new_features = []
    report = []
    for adcode, name in province_order:
        members = by_province.get(adcode, [])
        if not members:
            report.append((name, adcode, 'MISSING', 0))
            continue
        geoms = [shape(f['geometry']) for f in members]
        merged = unary_union(geoms)
        new_features.append({
            'type': 'Feature',
            'properties': {'adcode': adcode, 'name': name},
            'geometry': mapping(merged),
        })
        report.append((name, adcode, 'OK', len(members)))

    print(f"省份总数: {len(province_order)}, 成功生成: {len(new_features)}")
    missing = [r for r in report if r[2] != 'OK']
    if missing:
        print("以下省份未能找到对应市级数据，请检查 china-cities.json：")
        for name, adcode, status, _ in missing:
            print(f"  ! {name}({adcode}): {status}")
    else:
        print("全部省份均成功匹配市级数据，无遗漏。")

    new_outline = {
        'type': 'FeatureCollection',
        'features': new_features,
    }

    with open(OUTLINE_PATH, 'w', encoding='utf-8') as f:
        json.dump(new_outline, f, ensure_ascii=False, separators=(',', ':'))

    print(f"\n已写入 {OUTLINE_PATH}")
    print("下一步：请用 shapely 校验新文件与 china-cities.json 整体 bbox 是否完全一致，")
    print("再走 tsc/build 流程，最后请用户亲自在浏览器里缩放验证视觉效果。")


if __name__ == '__main__':
    main()
