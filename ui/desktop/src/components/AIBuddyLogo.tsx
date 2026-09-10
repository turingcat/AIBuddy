import { cn } from '../utils';
import logoUrl from '../images/logo.png';

interface AIBuddyLogoProps {
  className?: string;
  size?: 'default' | 'small';
}

// 组合 logo（原 AIBuddy+Rain 雨点动画）简化为单一品牌位图
// @author logic
// @date 2026-08-14
export default function AIBuddyLogo({ className = '', size = 'default' }: AIBuddyLogoProps) {
  const frame = size === 'default' ? 'w-16 h-16' : 'w-8 h-8';
  return <img src={logoUrl} alt="" draggable={false} className={cn(className, frame)} />;
}
