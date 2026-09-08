import { cn } from '../utils';
import logoUrl from '../images/logo.png';

interface HeyBuddyLogoProps {
  className?: string;
  size?: 'default' | 'small';
}

// 组合 logo（原 HeyBuddy+Rain 雨点动画）简化为单一品牌位图
// @author logic
// @date 2026-08-14
export default function HeyBuddyLogo({ className = '', size = 'default' }: HeyBuddyLogoProps) {
  const frame = size === 'default' ? 'w-16 h-16' : 'w-8 h-8';
  return <img src={logoUrl} alt="" draggable={false} className={cn(className, frame)} />;
}
