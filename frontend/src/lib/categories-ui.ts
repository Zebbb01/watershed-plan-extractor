import { Activity, ClipboardList, MapPin, Megaphone, Sprout, Target, type LucideIcon } from 'lucide-react';
import type { CategoryKey } from '@app/backend';

/** How each category looks: one colour (validated palette), one icon, always with its label. */
export const CATEGORY_UI: Record<CategoryKey, { label: string; short: string; color: string; icon: LucideIcon }> = {
  goals: { label: 'Goals', short: 'Goals', color: '#2a78d6', icon: Target },
  bmps: { label: 'BMPs', short: 'BMPs', color: '#eb6834', icon: Sprout },
  implementation: { label: 'Implementation', short: 'Activities', color: '#1baf7a', icon: ClipboardList },
  monitoring: { label: 'Monitoring', short: 'Monitoring', color: '#eda100', icon: Activity },
  outreach: { label: 'Outreach', short: 'Outreach', color: '#e87ba4', icon: Megaphone },
  geographicAreas: { label: 'Areas', short: 'Areas', color: '#6250d6', icon: MapPin },
};
