import { useState } from 'react';
import { Button } from '../../../ui/button';
import { SwitchModelModal } from './SwitchModelModal';
import type { View } from '../../../../utils/navigationUtils';
import { defineMessages, useIntl } from '../../../../i18n';

const i18n = defineMessages({
  switchModels: {
    id: 'modelSettingsButtons.switchModels',
    defaultMessage: 'Switch models',
  },
});

interface ConfigureModelButtonsProps {
  setView: (view: View) => void;
}

export default function ModelSettingsButtons({ setView }: ConfigureModelButtonsProps) {
  const intl = useIntl();
  const [isAddModelModalOpen, setIsAddModelModalOpen] = useState(false);

  return (
    <div className="flex gap-2 pt-4">
      <Button
        className="flex items-center gap-2 justify-center"
        variant="default"
        size="sm"
        onClick={() => setIsAddModelModalOpen(true)}
      >
        {intl.formatMessage(i18n.switchModels)}
      </Button>
      {isAddModelModalOpen ? (
        <SwitchModelModal
          sessionId={null}
          setView={setView}
          onClose={() => setIsAddModelModalOpen(false)}
        />
      ) : null}
    </div>
  );
}
