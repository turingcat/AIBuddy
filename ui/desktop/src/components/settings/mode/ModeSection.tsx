import { useEffect, useState, useCallback } from 'react';
import { all_aibuddy_modes, ModeSelectionItem } from './ModeSelectionItem';
import { useConfig } from '../../ConfigContext';
import { ConversationLimitsDropdown } from './ConversationLimitsDropdown';

export const ModeSection = () => {
  const [currentMode, setCurrentMode] = useState('auto');
  const [maxTurns, setMaxTurns] = useState<number>(1000);
  const { config, read, upsert } = useConfig();

  const handleModeChange = async (newMode: string) => {
    try {
      await upsert('AIBUDDY_MODE', newMode, false);
      setCurrentMode(newMode);
    } catch (error) {
      console.error('Error updating aibuddy mode:', error);
      throw new Error(`Failed to store new aibuddy mode: ${newMode}`, { cause: error });
    }
  };

  useEffect(() => {
    const mode = config.AIBUDDY_MODE as string | undefined;
    if (mode) {
      setCurrentMode(mode);
    }
  }, [config.AIBUDDY_MODE]);

  const fetchMaxTurns = useCallback(async () => {
    try {
      const turns = (await read('AIBUDDY_MAX_TURNS', false)) as number;
      if (turns) {
        setMaxTurns(turns);
      }
    } catch (error) {
      console.error('Error fetching max turns:', error);
    }
  }, [read]);

  const handleMaxTurnsChange = async (value: number) => {
    try {
      await upsert('AIBUDDY_MAX_TURNS', value, false);
      setMaxTurns(value);
    } catch (error) {
      console.error('Error updating max turns:', error);
    }
  };

  useEffect(() => {
    fetchMaxTurns();
  }, [fetchMaxTurns]);

  return (
    <div className="space-y-1">
      {/* Mode Selection */}
      {all_aibuddy_modes.map((mode) => (
        <ModeSelectionItem
          key={mode.key}
          mode={mode}
          currentMode={currentMode}
          showDescription={true}
          isApproveModeConfigure={false}
          handleModeChange={handleModeChange}
        />
      ))}

      {/* Conversation Limits Dropdown */}
      <ConversationLimitsDropdown maxTurns={maxTurns} onMaxTurnsChange={handleMaxTurnsChange} />
    </div>
  );
};
