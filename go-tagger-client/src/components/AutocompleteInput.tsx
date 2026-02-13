import { createSignal } from "solid-js";
import type { Accessor, Setter } from "solid-js";

interface AutocompleteInputProps {
  id: string;
  placeholder: string;
  value: Accessor<string>;
  onValueChange: Setter<string>;
  getSuggestions: (query: string) => Promise<string[]>;
  onAcceptSuggestion?: (suggestion: string) => void;
}

export function AutocompleteInput(props: AutocompleteInputProps) {
  const [suggestions, setSuggestions] = createSignal<string[]>([]);
  const [showDropdown, setShowDropdown] = createSignal(false);
  const [selectedIndex, setSelectedIndex] = createSignal(-1);

  const acceptSuggestion = (suggestion: string) => {
    if (props.onAcceptSuggestion) {
      props.onAcceptSuggestion(suggestion);
    } else {
      const current = props.value();
      const items = current ? current.split(",").map((t) => t.trim()) : [];
      items[items.length - 1] = suggestion;
      props.onValueChange(items.filter(Boolean).join(", "));
    }
    setShowDropdown(false);
    setSelectedIndex(-1);
  };

  return (
    <div class="autocomplete-wrapper">
      <input
        id={props.id}
        type="text"
        placeholder={props.placeholder}
        value={props.value()}
        onInput={async (event) => {
          const value = event.currentTarget.value;
          props.onValueChange(value);
          setSelectedIndex(-1);
          if (value.trim()) {
            const last = value.split(",").pop()?.trim() ?? "";
            if (last) {
              setSuggestions(await props.getSuggestions(last));
              setShowDropdown(true);
            } else {
              setShowDropdown(false);
            }
          } else {
            setShowDropdown(false);
          }
        }}
        onKeyDown={(event) => {
          if (!showDropdown() || suggestions().length === 0) return;

          if (event.key === "ArrowDown") {
            event.preventDefault();
            setSelectedIndex((prev) =>
              prev < suggestions().length - 1 ? prev + 1 : prev,
            );
          } else if (event.key === "ArrowUp") {
            event.preventDefault();
            setSelectedIndex((prev) => (prev > 0 ? prev - 1 : -1));
          } else if (event.key === "Enter" || event.key === "Tab") {
            const idx = selectedIndex();
            if (idx >= 0 && idx < suggestions().length) {
              event.preventDefault();
              acceptSuggestion(suggestions()[idx]);
            }
          } else if (event.key === "Escape") {
            setShowDropdown(false);
            setSelectedIndex(-1);
          }
        }}
        onBlur={() => setTimeout(() => setShowDropdown(false), 150)}
        onFocus={async (event) => {
          const value = event.currentTarget.value;
          if (value.trim()) {
            const last = value.split(",").pop()?.trim() ?? "";
            if (last) {
              setSuggestions(await props.getSuggestions(last));
              setShowDropdown(true);
            }
          }
        }}
        autocomplete="off"
      />
      {showDropdown() && suggestions().length > 0 && (
        <div class="autocomplete-dropdown">
          {suggestions().map((suggestion, index) => (
            <div
              class={`autocomplete-item ${
                selectedIndex() === index ? "selected" : ""
              }`}
              onMouseDown={() => acceptSuggestion(suggestion)}
              onMouseEnter={() => setSelectedIndex(index)}
            >
              {suggestion}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
