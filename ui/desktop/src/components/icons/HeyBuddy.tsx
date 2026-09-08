import { cn } from '../../utils';
import logoUrl from '../../images/logo.png';

// HeyBuddy 品牌图标：由内置 SVG 改为 logo.png 位图，默认 24x24 与旧版一致
// @author logic
// @date 2026-08-14
export function HeyBuddy({ className = '' }) {
  return <img src={logoUrl} alt="" draggable={false} className={cn('h-6 w-6', className)} />;
}
