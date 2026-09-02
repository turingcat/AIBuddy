import { useEffect, useState, useCallback, useRef } from 'react';
import { Bot, ExternalLink } from 'lucide-react';
import { defineMessages, useIntl } from '../../../../i18n';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../../ui/dialog';
import { Button } from '../../../ui/button';
import { QUICKSTART_GUIDE_URL } from '../../providers/modal/constants';
import { Select } from '../../../ui/Select';
import { acpReadThinkingEffort, acpSaveThinkingEffort } from '../../../../acp/providers';
import { useModelAndProvider } from '../../../ModelAndProviderContext';
import type { View } from '../../../../utils/navigationUtils';
import Model, { fetchModelReasoning } from '../modelInterface';
import type { ThinkingEffort } from '../../../../types/providers';
import { trackModelChanged } from '../../../../utils/analytics';
import { addToRecentModels } from '../../../../utils/recentModels';

const i18n = defineMessages({
  thinkingEffortOff: {
    id: 'switchModelModal.thinkingEffortOff',
    defaultMessage: 'Off - No extended thinking',
  },
  thinkingLevelLow: {
    id: 'switchModelModal.thinkingLevelLow',
    defaultMessage: 'Low - Better latency, lighter reasoning',
  },
  thinkingLevelHigh: {
    id: 'switchModelModal.thinkingLevelHigh',
    defaultMessage: 'High - Deeper reasoning, higher latency',
  },
  claudeEffortLow: {
    id: 'switchModelModal.claudeEffortLow',
    defaultMessage: 'Low - Minimal thinking, fastest responses',
  },
  claudeEffortMedium: {
    id: 'switchModelModal.claudeEffortMedium',
    defaultMessage: 'Medium - Moderate thinking',
  },
  claudeEffortHigh: {
    id: 'switchModelModal.claudeEffortHigh',
    defaultMessage: 'High - Deep reasoning (default)',
  },
  claudeEffortMax: {
    id: 'switchModelModal.claudeEffortMax',
    defaultMessage: 'Max - No constraints on thinking depth',
  },
  selectModel: {
    id: 'switchModelModal.selectModel',
    defaultMessage: 'Please select a model',
  },
  title: {
    id: 'switchModelModal.title',
    defaultMessage: 'Switch models',
  },
  description: {
    id: 'switchModelModal.description',
    defaultMessage: 'Select a model to use for your conversations.',
  },
  chooseModel: {
    id: 'switchModelModal.chooseModel',
    defaultMessage: 'Choose a model:',
  },
  recommended: {
    id: 'switchModelModal.recommended',
    defaultMessage: 'Recommended',
  },
  thinkingLevel: {
    id: 'switchModelModal.thinkingLevel',
    defaultMessage: 'Thinking Level',
  },
  geminiOnly: {
    id: 'switchModelModal.geminiOnly',
    defaultMessage: '(Gemini 3 models only)',
  },
  selectThinkingLevel: {
    id: 'switchModelModal.selectThinkingLevel',
    defaultMessage: 'Select thinking level',
  },
  extendedThinking: {
    id: 'switchModelModal.extendedThinking',
    defaultMessage: 'Extended Thinking',
  },
  selectThinkingMode: {
    id: 'switchModelModal.selectThinkingMode',
    defaultMessage: 'Select thinking mode',
  },
  thinkingEffort: {
    id: 'switchModelModal.thinkingEffort',
    defaultMessage: 'Thinking Effort',
  },
  selectEffortLevel: {
    id: 'switchModelModal.selectEffortLevel',
    defaultMessage: 'Select effort level',
  },
  thinkingBudget: {
    id: 'switchModelModal.thinkingBudget',
    defaultMessage: 'Thinking Budget (tokens)',
  },
  quickStartGuide: {
    id: 'switchModelModal.quickStartGuide',
    defaultMessage: 'Quick start guide',
  },
  cancel: {
    id: 'switchModelModal.cancel',
    defaultMessage: 'Cancel',
  },
  selectModelButton: {
    id: 'switchModelModal.selectModelButton',
    defaultMessage: 'Select model',
  },
  claudeAdaptive: {
    id: 'switchModelModal.claudeAdaptive',
    defaultMessage: 'Adaptive - Claude decides when and how much to think',
  },
  claudeEnabled: {
    id: 'switchModelModal.claudeEnabled',
    defaultMessage: 'Enabled - Fixed token budget for thinking',
  },
  claudeDisabled: {
    id: 'switchModelModal.claudeDisabled',
    defaultMessage: 'Disabled - No extended thinking',
  },
});

// Thinking effort options are created inside the component to support i18n.

type SwitchModelModalProps = {
  sessionId: string | null;
  onClose: () => void;
  setView: (view: View) => void;
  onModelSelected?: (model: string, provider: string) => void;
  initialProvider?: string | null;
  titleOverride?: string;
  sessionModel?: string | null;
  sessionProvider?: string | null;
};
export const SwitchModelModal = ({
  sessionId,
  onClose,
  onModelSelected,
  titleOverride,
  sessionModel,
}: SwitchModelModalProps) => {
  const intl = useIntl();

  const THINKING_EFFORT_OPTIONS: { value: ThinkingEffort; label: string }[] = [
    { value: 'off', label: intl.formatMessage(i18n.thinkingEffortOff) },
    { value: 'low', label: intl.formatMessage(i18n.claudeEffortLow) },
    { value: 'medium', label: intl.formatMessage(i18n.claudeEffortMedium) },
    { value: 'high', label: intl.formatMessage(i18n.claudeEffortHigh) },
    { value: 'max', label: intl.formatMessage(i18n.claudeEffortMax) },
  ];

  const { changeModel, currentModel: configModel, currentProvider } = useModelAndProvider();
  // Use session-specific model if available, otherwise fall back to config default
  const currentModel = sessionModel ?? configModel;
  const [validationErrors, setValidationErrors] = useState({ model: '' });
  const [isValid, setIsValid] = useState(true);
  const [attemptedSubmit, setAttemptedSubmit] = useState(false);
  // 阶段一：桌面版锁定为预定义模型选择，不暴露 provider 切换 / 自定义模型输入
  const usePredefinedModels = true;
  const [selectedPredefinedModel, setSelectedPredefinedModel] = useState<Model | null>(null);
  const [predefinedModels, setPredefinedModels] = useState<Model[]>([]);
  const reasoningRequestId = useRef(0);
  const [thinkingEffort, setThinkingEffort] = useState<ThinkingEffort | null>(null);
  const [selectedModelReasoning, setSelectedModelReasoning] = useState<boolean | null>(null);

  const modelReasoning = selectedModelReasoning ?? selectedPredefinedModel?.reasoning;
  const showThinkingControl = modelReasoning === true;
  const resolveSelectedModelReasoning = useCallback(
    (providerName: string, modelName: string, fallback?: boolean) => {
      const requestId = ++reasoningRequestId.current;
      setSelectedModelReasoning(fallback ?? null);
      fetchModelReasoning(providerName, modelName, fallback).then((reasoning) => {
        if (requestId === reasoningRequestId.current) {
          setSelectedModelReasoning(reasoning);
        }
      });
    },
    []
  );

  useEffect(() => {
    (async () => {
      try {
        const effort = await acpReadThinkingEffort();
        if (effort) setThinkingEffort(effort);
      } catch (e) {
        console.warn('Could not read thinking effort, using default:', e);
      }
    })();
  }, []);

  // Validate form data
  const validateForm = useCallback(() => {
    const errors = { model: '' };
    let formIsValid = true;

    if (!selectedPredefinedModel) {
      errors.model = intl.formatMessage(i18n.selectModel);
      formIsValid = false;
    }

    setValidationErrors(errors);
    setIsValid(formIsValid);
    return formIsValid;
  }, [selectedPredefinedModel, intl]);

  const handleClose = () => {
    onClose();
  };

  const handleSubmit = async () => {
    setAttemptedSubmit(true);
    const isFormValid = validateForm();

    if (isFormValid && selectedPredefinedModel) {
      let modelObj: Model = selectedPredefinedModel;
      modelObj = {
        ...modelObj,
        reasoning: selectedModelReasoning ?? modelObj.reasoning,
      };

      if (showThinkingControl) {
        const effort = thinkingEffort ?? modelObj.request_params?.thinking_effort ?? 'off';
        modelObj = {
          ...modelObj,
          request_params: { ...modelObj.request_params, thinking_effort: effort },
        };
        acpSaveThinkingEffort(effort).catch(console.warn);
      }

      const success = await changeModel(sessionId, modelObj);
      if (success) {
        trackModelChanged(modelObj.provider || '', modelObj.name);
        if (currentModel && currentProvider) {
          const current = (await window.electron.getSetting('recentModels')) ?? [];
          await window.electron.setSetting(
            'recentModels',
            addToRecentModels(current, currentProvider, currentModel)
          );
        }
        onModelSelected?.(modelObj.name, modelObj.provider || '');
      }

      onClose();
    }
  };

  // Re-validate when inputs change and after attempted submission
  useEffect(() => {
    if (attemptedSubmit) {
      validateForm();
    }
  }, [attemptedSubmit, validateForm]);

  // Initialize predefined model selection from session/config model.
  // Separate effect so it re-runs when currentModel loads asynchronously.
  useEffect(() => {
    if (!currentModel) return;
    const matchingModel = predefinedModels.find((m) => m.name === currentModel);
    if (matchingModel) {
      setSelectedPredefinedModel(matchingModel);
      resolveSelectedModelReasoning(
        matchingModel.provider,
        matchingModel.name,
        matchingModel.reasoning
      );
    }
  }, [currentModel, predefinedModels, resolveSelectedModelReasoning]);

  // 模型列表数据源：主进程直接 fetch new-api /v1/models（绕过 goose inventory refresh 依赖）。
  // @author logic
  // @date 2026-08-12
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const raw = await window.electron.listModelsViaApi();
      if (cancelled) return;
      const mapped = raw.map((m) => ({
        name: m.id,
        provider: m.providerId ?? currentProvider ?? 'heybuddy',
        context_limit: m.contextLimit ?? undefined,
        reasoning: m.reasoning ?? undefined,
      }));
      setPredefinedModels(mapped);
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [currentProvider]);

  const handlePredefinedModelChange = (model: Model) => {
    setSelectedPredefinedModel(model);
    resolveSelectedModelReasoning(model.provider, model.name, model.reasoning);
  };

  const thinkingEffortControl = showThinkingControl && (
    <div className="mt-2">
      <label className="text-sm text-textSubtle mb-1 block">
        {intl.formatMessage(i18n.thinkingEffort)}
      </label>
      <Select
        options={THINKING_EFFORT_OPTIONS}
        value={THINKING_EFFORT_OPTIONS.find((o) => o.value === (thinkingEffort ?? 'off'))}
        onChange={(newValue: unknown) => {
          const option = newValue as { value: ThinkingEffort; label: string } | null;
          setThinkingEffort(option?.value || 'off');
        }}
        placeholder={intl.formatMessage(i18n.selectEffortLevel)}
      />
    </div>
  );

  return (
    <Dialog open={true} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Bot size={24} className="text-text-primary" />
            {titleOverride || intl.formatMessage(i18n.title)}
          </DialogTitle>
          <DialogDescription>{intl.formatMessage(i18n.description)}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-4">
          {usePredefinedModels && (
            <div className="w-full flex flex-col gap-4">
              <div className="flex justify-between items-center">
                <label className="text-sm font-medium text-text-primary">
                  {intl.formatMessage(i18n.chooseModel)}
                </label>
              </div>

              <div className="space-y-2 max-h-64 overflow-y-auto">
                {predefinedModels.map((model) => (
                  <div key={model.id || model.name} className="group hover:cursor-pointer text-sm">
                    <div
                      className={`flex items-center justify-between text-text-primary py-2 px-2 ${
                        selectedPredefinedModel?.name === model.name
                          ? 'bg-background-secondary'
                          : 'bg-background-primary hover:bg-background-secondary'
                      } rounded-lg transition-all`}
                      onClick={() => handlePredefinedModelChange(model)}
                    >
                      <div className="flex-1">
                        <div className="flex items-center justify-between">
                          <span className="text-text-primary font-medium">
                            {model.alias || model.name}
                          </span>
                          {model.alias?.includes('recommended') && (
                            <span className="text-xs bg-background-secondary text-text-primary px-2 py-1 rounded-full border border-border-primary ml-2">
                              {intl.formatMessage(i18n.recommended)}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-[2px]">
                          <span className="text-xs text-text-secondary">{model.subtext}</span>
                          <span className="text-xs text-text-secondary">•</span>
                          <span className="text-xs text-text-secondary">{model.provider}</span>
                        </div>
                      </div>

                      <div className="relative flex items-center ml-3">
                        <input
                          type="radio"
                          name="predefined-model"
                          value={model.name}
                          checked={selectedPredefinedModel?.name === model.name}
                          onChange={() => handlePredefinedModelChange(model)}
                          className="peer sr-only"
                        />
                        <div
                          className="h-4 w-4 rounded-full border border-border-primary
                                peer-checked:border-[6px] peer-checked:border-black dark:peer-checked:border-white
                                peer-checked:bg-white dark:peer-checked:bg-black
                                transition-all duration-200 ease-in-out group-hover:border-border-primary"
                        ></div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {attemptedSubmit && validationErrors.model && (
                <div className="text-red-500 text-sm mt-1">{validationErrors.model}</div>
              )}

              {thinkingEffortControl}
            </div>
          )}
        </div>

        <DialogFooter className="pt-4 flex-col sm:flex-row gap-3">
          <a
            href={QUICKSTART_GUIDE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center text-text-secondary hover:text-text-primary text-sm mr-auto"
          >
            <ExternalLink size={14} className="mr-1" />
            {intl.formatMessage(i18n.quickStartGuide)}
          </a>
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleClose} type="button">
              {intl.formatMessage(i18n.cancel)}
            </Button>
            <Button onClick={handleSubmit} disabled={!isValid}>
              {intl.formatMessage(i18n.selectModelButton)}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
