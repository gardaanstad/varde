import {
  Building2,
  Bike,
  Car,
  CloudRain,
  Drama,
  Droplets,
  Factory,
  Flame,
  GlassWater,
  Home,
  Hospital,
  Landmark,
  Plane,
  Route,
  School,
  Ship,
  Store,
  TrainFront,
  TramFront,
  Trees,
  UtilityPole,
  Waves,
  Wind,
  Zap,
  type LucideProps,
} from "lucide-react";
import type { Category } from "../lib/data";

const icons: Record<Category, React.ComponentType<LucideProps>> = {
  Samferdsel: Route,
  Vei: Car,
  Jernbane: TrainFront,
  Kollektiv: TramFront,
  "Sykkel og gange": Bike,
  Havn: Ship,
  Luftfart: Plane,
  Energi: Zap,
  Kraftproduksjon: Wind,
  Strømnett: UtilityPole,
  Fjernvarme: Flame,
  "CO₂-lagring": Factory,
  "Vann og avløp": Droplets,
  Drikkevann: GlassWater,
  Avløp: Waves,
  Overvann: CloudRain,
  "Offentlige bygg": Landmark,
  Helse: Hospital,
  Skole: School,
  "Kultur og idrett": Drama,
  Forvaltning: Landmark,
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

