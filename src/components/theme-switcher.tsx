import { useHydrated } from '@tanstack/react-router';
import {
  ChevronsUpDownIcon,
  MonitorIcon,
  MoonIcon,
  SunIcon,
} from 'lucide-react';
import { useTheme } from 'next-themes';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

const themeOptions = [
  { value: 'light', label: 'Light', icon: SunIcon },
  { value: 'dark', label: 'Dark', icon: MoonIcon },
  { value: 'system', label: 'System', icon: MonitorIcon },
] as const;

export function ThemeSwitcher() {
  const { theme, setTheme } = useTheme();
  // Theme is only known on the client; render a stable placeholder until
  // hydrated to avoid a hydration mismatch.
  const hydrated = useHydrated();

  const activeOption =
    themeOptions.find((option) => option.value === theme) ?? themeOptions[2];
  const ActiveIcon = hydrated ? activeOption.icon : MonitorIcon;
  const activeLabel = hydrated ? activeOption.label : 'Theme';

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="w-full"
        render={<Button variant="outline" />}
      >
        <div className="w-full px-2 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <ActiveIcon className="size-4.5 stroke-[1.75]" />
            {activeLabel}
          </div>
          <ChevronsUpDownIcon className="size-4" />
        </div>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        className="w-(--anchor-width)"
        align="start"
        side="top"
      >
        <DropdownMenuRadioGroup
          value={theme}
          onValueChange={(value) => setTheme(value)}
        >
          {themeOptions.map((option) => (
            <DropdownMenuRadioItem key={option.value} value={option.value}>
              <div className="flex items-center gap-2">
                <option.icon className="size-4" />
                {option.label}
              </div>
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
