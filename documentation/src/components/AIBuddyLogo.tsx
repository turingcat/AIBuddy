import { useColorMode } from '@docusaurus/theme-common';

export const AIBuddyLogo = (props: { className?: string }) => {
  const { colorMode } = useColorMode();
  
  const logoSrc = colorMode === 'dark' 
    ? 'img/aibuddy-logo-white.png' 
    : 'img/aibuddy-logo-black.png';
  
  const logoAlt = 'AIBuddy logo';

  return (
    <img
      src={logoSrc}
      alt={logoAlt}
      className={props.className}
      style={{ height: 'auto', maxWidth: '100%' }}
    />
  );
};
