import React from 'react';
import { cn } from '../../utils';
import logoUrl from '../../images/logo.png';

type Props = Omit<React.ComponentPropsWithoutRef<'img'>, 'src' | 'alt'>;

// AIBuddies 品牌图标：由内置 SVG 改为 logo.png 位图，默认 24x24
// @author logic
// @date 2026-08-14
export function AIBuddies({ className, ...props }: Props) {
  return (
    <img
      src={logoUrl}
      alt=""
      draggable={false}
      className={cn('h-6 w-6', className)}
      {...props}
    />
  );
}
