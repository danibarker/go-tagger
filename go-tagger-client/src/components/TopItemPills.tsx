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
          style={{
            padding: "0.25rem 0.75rem",
            "border-radius": "999px",
            border: "1px solid #ccc",
            background: "#f5f5f5",
            cursor: "pointer",
            "font-size": "0.9em",
          }}
          onClick={() => props.onItemClick(item)}
        >
          {item}
        </button>
      ))}
    </div>
  );
}
