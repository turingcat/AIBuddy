import React from 'react';
import { PanelLeft } from 'lucide-react';

interface HeyBuddyBuiltinInstallerProps {
  extensionName: string;
  description?: string;
}

const HeyBuddyBuiltinInstaller: React.FC<HeyBuddyBuiltinInstallerProps> = ({
  extensionName,
  description
}) => {
  return (
    <div className="heybuddy-builtin-installer">
      <ol>
        <li>Click the <PanelLeft className="inline" size={16} /> button in the top-left to open the sidebar</li>
        <li>Click <code>Extensions</code> in the sidebar</li>
        <li>Toggle <code>{extensionName}</code> on</li>
      </ol>
    </div>
  );
};

export default HeyBuddyBuiltinInstaller;
