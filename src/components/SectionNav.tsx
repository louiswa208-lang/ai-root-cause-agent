"use client";

export interface NavSection {
  id: string;
  label: string;
}

/**
 * 右侧内容的快捷导航。点击只滚动 Main 容器，不滚动整个页面。
 */
export function SectionNav({
  sections,
  active,
  onJump,
}: {
  sections: NavSection[];
  active: string;
  onJump: (id: string) => void;
}) {
  if (!sections.length) return null;
  return (
    <nav className="section-nav x-scroll" aria-label="页面区块导航">
      {sections.map((s) => (
        <button key={s.id} data-active={active === s.id} onClick={() => onJump(s.id)} type="button">
          {s.label}
        </button>
      ))}
    </nav>
  );
}
