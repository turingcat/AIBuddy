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
    id: 'heybuddyhintsModal.dialogTitle',
    defaultMessage: 'Configure Project Hints (.heybuddyhints)',
  },
  dialogDescription: {
    id: 'heybuddyhintsModal.dialogDescription',
    defaultMessage:
      'Provide additional context about your project to improve communication with {appName}',
  },
  helpText1: {
    id: 'heybuddyhintsModal.helpText1',
    defaultMessage:
      '.heybuddyhints is a text file used to provide additional context about your project and improve the communication with {appName}.',
  },
  helpText2: {
    id: 'heybuddyhintsModal.helpText2',
    defaultMessage:
      "Please make sure {bold} extension is enabled in the extensions page. This extension is required to use .heybuddyhints. You'll need to restart your session for .heybuddyhints updates to take effect.",
  },
  helpText3: {
    id: 'heybuddyhintsModal.helpText3',
    defaultMessage: 'See {link} for more information.',
  },
  helpTextLink: {
    id: 'heybuddyhintsModal.helpTextLink',
    defaultMessage: 'using .heybuddyhints',
  },
  errorReading: {
    id: 'heybuddyhintsModal.errorReading',
    defaultMessage: 'Error reading .heybuddyhints file: {error}',
  },
  fileFound: {
    id: 'heybuddyhintsModal.fileFound',
    defaultMessage: '.heybuddyhints file found at: {filePath}',
  },
  fileCreating: {
    id: 'heybuddyhintsModal.fileCreating',
    defaultMessage: 'Creating new .heybuddyhints file at: {filePath}',
  },
  placeholder: {
    id: 'heybuddyhintsModal.placeholder',
    defaultMessage: 'Enter project hints here...',
  },
  savedSuccessfully: {
    id: 'heybuddyhintsModal.savedSuccessfully',
    defaultMessage: 'Saved successfully',
  },
  close: {
    id: 'heybuddyhintsModal.close',
    defaultMessage: 'Close',
  },
  saving: {
    id: 'heybuddyhintsModal.saving',
    defaultMessage: 'Saving...',
  },
  save: {
    id: 'heybuddyhintsModal.save',
    defaultMessage: 'Save',
  },
  failedToAccess: {
    id: 'heybuddyhintsModal.failedToAccess',
    defaultMessage: 'Failed to access .heybuddyhints file',
  },
  failedToSave: {
    id: 'heybuddyhintsModal.failedToSave',
    defaultMessage: 'Failed to save .heybuddyhints file',
  },
  developer: {
    id: 'heybuddyhintsModal.developer',
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

interface HeyBuddyhintsModalProps {
  directory: string;
  setIsHeyBuddyhintsModalOpen: (isOpen: boolean) => void;
}

export const HeyBuddyhintsModal = ({ directory, setIsHeyBuddyhintsModalOpen }: HeyBuddyhintsModalProps) => {
  const intl = useIntl();
  const heybuddyhintsFilePath = `${directory}/.heybuddyhints`;
  const [heybuddyhintsFile, setHeyBuddyhintsFile] = useState<string>('');
  const [heybuddyhintsFileFound, setHeyBuddyhintsFileFound] = useState<boolean>(false);
  const [heybuddyhintsFileReadError, setHeyBuddyhintsFileReadError] = useState<string>('');
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  useEffect(() => {
    const fetchHeyBuddyhintsFile = async () => {
      try {
        const { file, error, found } = await window.electron.readHeyBuddyhints();
        setHeyBuddyhintsFile(file);
        setHeyBuddyhintsFileFound(found);
        setHeyBuddyhintsFileReadError(error ?? '');
      } catch (error) {
        console.error('Error fetching .heybuddyhints file:', error);
        setHeyBuddyhintsFileReadError(intl.formatMessage(i18n.failedToAccess));
      }
    };
    if (directory) fetchHeyBuddyhintsFile();
  }, [directory, intl]);

  const writeFile = async () => {
    setIsSaving(true);
    setSaveSuccess(false);
    try {
      const saved = await window.electron.writeHeyBuddyhints(heybuddyhintsFile);
      if (!saved) {
        throw new Error('Unable to save .heybuddyhints');
      }
      setSaveSuccess(true);
      setHeyBuddyhintsFileFound(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (error) {
      console.error('Error writing .heybuddyhints file:', error);
      setHeyBuddyhintsFileReadError(intl.formatMessage(i18n.failedToSave));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={true} onOpenChange={(open) => setIsHeyBuddyhintsModalOpen(open)}>
      <DialogContent className="w-[80vw] max-w-[80vw] sm:max-w-[80vw] max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{intl.formatMessage(i18n.dialogTitle)}</DialogTitle>
          <DialogDescription>{intl.formatMessage(i18n.dialogDescription)}</DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-4 pt-2 pb-4">
          <HelpText />

          <div>
            {heybuddyhintsFileReadError ? (
              <ErrorDisplay error={new Error(heybuddyhintsFileReadError)} />
            ) : (
              <div className="space-y-2">
                <FileInfo filePath={heybuddyhintsFilePath} found={heybuddyhintsFileFound} />
                <textarea
                  value={heybuddyhintsFile}
                  className="w-full h-80 border rounded-md p-2 text-sm resize-none bg-background-primary text-text-primary border-border-primary focus:outline-none focus:ring-2 focus:ring-blue-500"
                  onChange={(event) => setHeyBuddyhintsFile(event.target.value)}
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
          <Button variant="outline" onClick={() => setIsHeyBuddyhintsModalOpen(false)}>
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
