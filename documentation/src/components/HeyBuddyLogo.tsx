import { useColorMode } from '@docusaurus/theme-common';

export const HeyBuddyLogo = (props: { className?: string }) => {
  const { colorMode } = useColorMode();
  
  const logoSrc = colorMode === 'dark' 
    ? 'img/heybuddy-logo-white.png' 
    : 'img/heybuddy-logo-black.png';
  
  const logoAlt = 'HeyBuddy logo';

  return (
    <img
      src={logoSrc}
      alt={logoAlt}
      className={props.className}
      style={{ height: 'auto', maxWidth: '100%' }}
    />
  );
};
