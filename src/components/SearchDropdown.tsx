import { KeyboardEvent, useMemo, useState } from 'react';
import { CITIES } from '../data/cities';
import { useStore } from '../store/useStore';
import { fuzzySearch } from '../utils/search';
import type { CityData } from '../types';

export default function SearchDropdown() {
  const query = useStore((state) => state.searchQuery);
  const setQuery = useStore((state) => state.setSearchQuery);
  const setPreviewCity = useStore((state) => state.setPreviewCity);
  const setSelectedCity = useStore((state) => state.setSelectedCity);
  const [active, setActive] = useState(0);
  const results = useMemo(() => fuzzySearch(query, CITIES), [query]);

  const choose = (city: CityData) => {
    setQuery(city.city_name);
    setPreviewCity(city);
    setSelectedCity(city);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (!results.length) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActive((value) => (value + 1) % results.length);
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((value) => (value - 1 + results.length) % results.length);
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      choose(results[active]);
    }
  };

  return (
    <div className="search">
      <input
        className="input"
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setActive(0);
        }}
        onKeyDown={onKeyDown}
        placeholder="搜索城市、省份或拼音"
        aria-label="搜索城市"
      />
      {query.trim() && results.length > 0 && (
        <div className="search-results card">
          {results.map((city, index) => (
            <button
              key={city.city_id}
              className={`search-item ${index === active ? 'active' : ''}`}
              onMouseEnter={() => setActive(index)}
              onClick={() => choose(city)}
            >
              <span>{city.city_name}</span>
              <small>{city.province} · {city.pinyin}</small>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
