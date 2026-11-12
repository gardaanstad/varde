import { statusOrder } from "../lib/data";
import { statusTone } from "../lib/ui";

/**
 * Which statuses the list shows, at a glance: a filled dot for each one
 * shown, a ring for each one hidden, in the cards' colours.
 */
export default function StatusDots({ values }: { values: string[] }) {
  return (
    <svg
      width="27"
      height="7"
      viewBox="0 0 27 7"
      aria-hidden="true"
      data-status-dots={values.length ? values.join(",") : "all"}
    >
      {statusOrder.map((value, i) =>
        values.length === 0 || values.includes(value) ? (
          <circle
            key={value}
            cx={3.5 + i * 10}
            cy="3.5"
            r="3.5"
            className={statusTone[value].fill}
          />
        ) : (
          <circle
            key={value}
            cx={3.5 + i * 10}
            cy="3.5"
            r="2.75"
            fill="none"
            stroke="currentColor"
            strokeOpacity="0.55"
            strokeWidth="1.5"
          />
        ),
      )}
    </svg>
  );
}
