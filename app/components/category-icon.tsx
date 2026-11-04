import {
  Building2,
  Droplets,
  Home,
  Landmark,
  Store,
  TrainFront,
  Trees,
  Zap,
  type LucideProps,
} from "lucide-react";
import type { Category } from "../lib/data";

const icons: Record<Category, React.ComponentType<LucideProps>> = {
  Samferdsel: TrainFront,
  Energi: Zap,
  "Vann og avløp": Droplets,
  "Offentlige bygg": Landmark,
  Byutvikling: Building2,
  Bolig: Home,
  Næring: Store,
  "Byrom og park": Trees,
};

export default function CategoryIcon({
  category,
  ...props
}: LucideProps & { category: Category }) {
  const Icon = icons[category] ?? Building2;
  return <Icon aria-hidden="true" {...props} />;
}
