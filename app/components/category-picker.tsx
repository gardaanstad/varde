"use client";

import {
  categoryLabels,
  categoryTree,
  type Category,
  normalizeCategories,
} from "../lib/data";
import { cn } from "../lib/cn";
import CategoryIcon from "./category-icon";
import ChoiceSelect from "./choice-select";

const options = categoryTree.map((node) => ({
  value: node.name,
  label: node.name,
  icon: <CategoryIcon category={node.name} size={16} />,
  children: node.subcategories.map((sub) => ({ value: sub, label: sub })),
}));

/**
 * A project's categories: main categories, each narrowed to subcategories
 * that open underneath it once it's chosen. The same menu as the filter.
 */
export default function CategoryPicker({
  value,
  onChange,
  className,
  triggerClassName,
}: {
  value: Category[];
  onChange: (value: Category[]) => void;
  className?: string;
  triggerClassName?: string;
}) {
  const labels = categoryLabels(value);
  return (
    <ChoiceSelect
      label="Kategori"
      multiple
      value={value}
      onChange={(next) => onChange(normalizeCategories(next))}
      options={options}
      triggerLabel={labels.join(", ") || "Velg kategori"}
      className={cn(
        // Field labels around it are bold; the menu reads like the filter's.
        "w-full font-normal",
        // The labels say it all; no count badge.
        "[&_[data-slot=choice-trigger]>span:nth-of-type(2)]:hidden",
        className,
      )}
      triggerClassName={cn(
        "font-normal",
        !labels.length && "text-muted",
        triggerClassName,
      )}
    />
  );
}
