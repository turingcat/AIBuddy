import { useState, useEffect } from 'react';
import { Button } from '../../ui/button';
import { Check } from '../../icons';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../ui/dialog';
import { errorMessage } from '../../../utils/conversionUtils';
import { defineMessages, useIntl } from '../../../i18n';

const i18n = defineMessages({
  dialogTitle: {
    id: 'aibuddyhintsModal.dialogTitle',
    defaultMessage: 'Configure Project Hints (.aibuddyhints)',
  },
  dialogDescription: {
    id: 'aibuddyhintsModal.dialogDescription',
    defaultMessage:
      'Provide additional context about your project to improve communication with {appName}',
  },
  helpText1: {
    id: 'aibuddyhintsModal.helpText1',
    defaultMessage:
      '.aibuddyhints is a text file used to provide additional context about your project and improve the communication with {appName}.',
  },
  helpText2: {
    id: 'aibuddyhintsModal.helpText2',
    defaultMessage:
      "Please make sure {bold} extension is enabled in the extensions page. This extension is required to use .aibuddyhints. You'll need to restart your session for .aibuddyhints updates to take effect.",
  },
  helpText3: {
    id: 'aibuddyhintsModal.helpText3',
    defaultMessage: 'See {link} for more information.',
  },
  helpTextLink: {
    id: 'aibuddyhintsModal.helpTextLink',
    defaultMessage: 'using .aibuddyhints',
  },
  errorReading: {
    id: 'aibuddyhintsModal.errorReading',
    defaultMessage: 'Error reading .aibuddyhints file: {error}',
  },
  fileFound: {
    id: 'aibuddyhintsModal.fileFound',
    defaultMessage: '.aibuddyhints file found at: {filePath}',
  },
  fileCreating: {
    id: 'aibuddyhintsModal.fileCreating',
    defaultMessage: 'Creating new .aibuddyhints file at: {filePath}',
  },
  placeholder: {
    id: 'aibuddyhintsModal.placeholder',
    defaultMessage: 'Enter project hints here...',
  },
  savedSuccessfully: {
    id: 'aibuddyhintsModal.savedSuccessfully',
    defaultMessage: 'Saved successfully',
  },
  close: {
    id: 'aibuddyhintsModal.close',
    defaultMessage: 'Close',
  },
  saving: {
    id: 'aibuddyhintsModal.saving',
    defaultMessage: 'Saving...',
  },
  save: {
    id: 'aibuddyhintsModal.save',
    defaultMessage: 'Save',
  },
  failedToAccess: {
    id: 'aibuddyhintsModal.failedToAccess',
    defaultMessage: 'Failed to access .aibuddyhints file',
  },
  failedToSave: {
    id: 'aibuddyhintsModal.failedToSave',
    defaultMessage: 'Failed to save .aibuddyhints file',
  },
  developer: {
    id: 'aibuddyhintsModal.developer',
    defaultMessage: 'Developer',
  },
});

const HelpText = () => {
  const intl = useIntl();

  return (
    <div className="text-sm flex-col space-y-4 text-text-secondary">
      <p>{intl.formatMessage(i18n.helpText1)}</p>
      <p>
        {intl.formatMessage(i18n.helpText2, {
          bold: <span className="font-bold">{intl.formatMessage(i18n.developer)}</span>,
        })}
      </p>
      <p>
        {intl.formatMessage(i18n.helpText3, {
          link: (
            <Button
              variant="link"
              className="text-blue-500 hover:text-blue-600 p-0 h-auto"
              onClick={() =>
                window.open('https://goose-docs.ai/docs/guides/using-goosehints/', '_blank')
              }
            >
              {intl.formatMessage(i18n.helpTextLink)}
            </Button>
          ),
        })}
      </p>
    </div>
  );
};

const ErrorDisplay = ({ error }: { error: Error }) => {
  const intl = useIntl();

  return (
    <div className="text-sm text-text-secondary">
      <div className="text-red-600">
        {intl.formatMessage(i18n.errorReading, { error: errorMessage(error) })}
      </div>
    </div>
  );
};

const FileInfo = ({ filePath, found }: { filePath: string; found: boolean }) => {
  const intl = useIntl();

  return (
    <div className="text-sm font-medium mb-2">
      {found ? (
        <div className="text-green-600">
          <Check className="w-4 h-4 inline-block" />{' '}
          {intl.formatMessage(i18n.fileFound, { filePath })}
        </div>
      ) : (
        <div>{intl.formatMessage(i18n.fileCreating, { filePath })}</div>
      )}
    </div>
  );
};

interface AIBuddyhintsModalProps {
  directory: string;
  setIsAIBuddyhintsModalOpen: (isOpen: boolean) => void;
}

export const AIBuddyhintsModal = ({ directory, setIsAIBuddyhintsModalOpen }: AIBuddyhintsModalProps) => {
  const intl = useIntl();
  const aibuddyhintsFilePath = `${directory}/.aibuddyhints`;
  const [aibuddyhintsFile, setAIBuddyhintsFile] = useState<string>('');
  const [aibuddyhintsFileFound, setAIBuddyhintsFileFound] = useState<boolean>(false);
  const [aibuddyhintsFileReadError, setAIBuddyhintsFileReadError] = useState<string>('');
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  useEffect(() => {
    const fetchAIBuddyhintsFile = async () => {
      try {
        const { file, error, found } = await window.electron.readAIBuddyhints();
        setAIBuddyhintsFile(file);
        setAIBuddyhintsFileFound(found);
        setAIBuddyhintsFileReadError(error ?? '');
      } catch (error) {
        console.error('Error fetching .aibuddyhints file:', error);
        setAIBuddyhintsFileReadError(intl.formatMessage(i18n.failedToAccess));
      }
    };
    if (directory) fetchAIBuddyhintsFile();
  }, [directory, intl]);

  const writeFile = async () => {
    setIsSaving(true);
    setSaveSuccess(false);
    try {
      const saved = await window.electron.writeAIBuddyhints(aibuddyhintsFile);
      if (!saved) {
        throw new Error('Unable to save .aibuddyhints');
      }
      setSaveSuccess(true);
      setAIBuddyhintsFileFound(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (error) {
      console.error('Error writing .aibuddyhints file:', error);
      setAIBuddyhintsFileReadError(intl.formatMessage(i18n.failedToSave));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={true} onOpenChange={(open) => setIsAIBuddyhintsModalOpen(open)}>
      <DialogContent className="w-[80vw] max-w-[80vw] sm:max-w-[80vw] max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{intl.formatMessage(i18n.dialogTitle)}</DialogTitle>
          <DialogDescription>{intl.formatMessage(i18n.dialogDescription)}</DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-4 pt-2 pb-4">
          <HelpText />

          <div>
            {aibuddyhintsFileReadError ? (
              <ErrorDisplay error={new Error(aibuddyhintsFileReadError)} />
            ) : (
              <div className="space-y-2">
                <FileInfo filePath={aibuddyhintsFilePath} found={aibuddyhintsFileFound} />
                <textarea
                  value={aibuddyhintsFile}
                  className="w-full h-80 border rounded-md p-2 text-sm resize-none bg-background-primary text-text-primary border-border-primary focus:outline-none focus:ring-2 focus:ring-blue-500"
                  onChange={(event) => setAIBuddyhintsFile(event.target.value)}
                  placeholder={intl.formatMessage(i18n.placeholder)}
                />
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          {saveSuccess && (
            <span className="text-green-600 text-sm flex items-center gap-1 mr-auto">
              <Check className="w-4 h-4" />
              {intl.formatMessage(i18n.savedSuccessfully)}
            </span>
          )}
          <Button variant="outline" onClick={() => setIsAIBuddyhintsModalOpen(false)}>
            {intl.formatMessage(i18n.close)}
          </Button>
          <Button onClick={writeFile} disabled={isSaving}>
            {isSaving ? intl.formatMessage(i18n.saving) : intl.formatMessage(i18n.save)}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
