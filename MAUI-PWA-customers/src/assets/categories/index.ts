import type { LucideIcon } from 'lucide-react';
import {
  Milk,
  ShoppingBasket,
  Apple,
  Beef,
  Sparkles,
  Wheat,
  GlassWater,
  LayoutGrid,
} from 'lucide-react';

export const categoryIcons: Record<string, LucideIcon> = {
  lacteos: Milk,
  despensa: ShoppingBasket,
  'frutas-verduras': Apple,
  carnes: Beef,
  aseo: Sparkles,
  panaderia: Wheat,
  bebidas: GlassWater,
};

export const defaultCategoryIcon: LucideIcon = LayoutGrid;
