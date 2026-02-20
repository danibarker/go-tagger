interface TopItemPillsProps {
  items: string[];
  onItemClick: (item: string) => void;
}

export function TopItemPills(props: TopItemPillsProps) {
  return (
    <div
      style={{
        display: "flex",
        gap: "0.5rem",
        "flex-wrap": "wrap",
        margin: "0.5rem 0",
      }}
    >
      {props.items.map((item) => (
        <button
          type="button"
          class="pill"
          onClick={() => props.onItemClick(item)}
        >
          {item}
        </button>
      ))}
    </div>
  );
}
