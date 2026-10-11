import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CircleAlertIcon } from 'lucide-react';
import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { toast } from 'sonner';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Spinner } from '@/components/ui/spinner';
import { categoriesQueryOptions } from '@/features/categories/queries';
import { smartImport } from '@/features/imports/api';
import {
  candidatesFromExport,
  type ImportCandidate,
} from '@/features/imports/candidates';
import { ImportReviewStep } from '@/features/imports/components/import-review-step';
import {
  ImportUploadStep,
  type SmartImportAvailability,
  type UploadNotice,
} from '@/features/imports/components/import-upload-step';
import {
  classifyFileSelection,
  type ExportFileFormat,
  getSmartImportMediaType,
  SMART_IMPORT_MAX_PAGES,
  TOO_MANY_PAGES_MESSAGE,
} from '@/features/imports/files';
import { countPages, UnreadableFileError } from '@/features/imports/pages';
import {
  smartImportStatusQueryKey,
  smartImportStatusQueryOptions,
} from '@/features/imports/queries';
import {
  createReviewState,
  formatImportResult,
  type ReviewContext,
  type ReviewState,
} from '@/features/imports/review';
import type {
  SmartImportResponse,
  SmartImportStatus,
} from '@/features/imports/server';
import { getSmartImportUsageMessage } from '@/features/imports/usage';
import { parseSubscriptionImport } from '@/features/subscriptions/import';
import { useImportSubscriptions } from '@/features/subscriptions/mutations';
import { subscriptionsQueryOptions } from '@/features/subscriptions/queries';
import type { ImportSubscriptionItem } from '@/features/subscriptions/schema';
import { track } from '@/lib/analytics';

export type ImportTarget = { id: string; name: string };

type ImportSubscriptionsDialogProps = {
  collection: ImportTarget;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Files chosen before opening, such as ones dropped on the page, to start with. */
  initialFiles?: File[];
  /** Called once the reviewed subscriptions are saved, before the dialog closes. */
  onImported?: () => void;
  /** Where focus goes when the dialog closes. Defaults to the trigger. */
  finalFocus?: React.ComponentProps<typeof DialogContent>['finalFocus'];
  /** Called once opening or closing, including its animation, finishes. */
  onOpenChangeComplete?: (open: boolean) => void;
};

/**
 * Imports subscriptions into one collection from an EverySub export or, with
 * smart import, from statements, receipts, and screenshots. Nothing is saved
 * until the user confirms the reviewed rows.
 */
export function ImportSubscriptionsDialog({
  collection,
  open,
  onOpenChange,
  initialFiles,
  onImported,
  finalFocus,
  onOpenChangeComplete,
}: ImportSubscriptionsDialogProps) {
  // Every open starts a fresh import bound to the collection it opened for, so
  // its rows, duplicate checks, and categories can't end up imported into
  // another collection. The session only changes on open, so the dialog stays
  // mounted through its close animation.
  const [session, setSession] = useState({
    id: 0,
    collection,
    initialFiles: initialFiles ?? [],
  });
  const [wasOpen, setWasOpen] = useState(open);

  if (open !== wasOpen) {
    setWasOpen(open);

    if (open) {
      setSession((current) => ({
        id: current.id + 1,
        collection,
        initialFiles: initialFiles ?? [],
      }));
    }
  }

  return (
    <ImportDialog
      key={session.id}
      collection={session.collection}
      open={open}
      onOpenChange={onOpenChange}
      initialFiles={session.initialFiles}
      onImported={onImported}
      finalFocus={finalFocus}
      onOpenChangeComplete={onOpenChangeComplete}
    />
  );
}

type Step = 'upload' | 'running' | 'reviewFailed' | 'review';

const RUNNING_MESSAGE =
  'Reading your files and looking up merchants. This can take a minute or two.';

const SMART_IMPORT_FAILED_MESSAGE = 'Smart import failed. Try again.';

function ImportDialog({
  collection,
  open,
  onOpenChange,
  initialFiles = [],
  onImported,
  finalFocus,
  onOpenChangeComplete,
}: ImportSubscriptionsDialogProps) {
  const queryClient = useQueryClient();
  const importSubscriptions = useImportSubscriptions();
  const { data: status } = useQuery({
    ...smartImportStatusQueryOptions(),
    enabled: open,
  });

  const [step, setStep] = useState<Step>('upload');
  const [attachedFiles, setAttachedFiles] = useState<File[]>([]);
  const [notice, setNotice] = useState<UploadNotice | null>(null);
  const [lastRunFailed, setLastRunFailed] = useState(false);
  const [checking, setChecking] = useState(false);
  const [review, setReview] = useState<ReviewState | null>(null);
  const [reviewContext, setReviewContext] = useState<ReviewContext | null>(
    null,
  );
  // Found rows kept when the review couldn't load, so retrying doesn't need
  // another smart import run.
  const [unreviewed, setUnreviewed] = useState<ImportCandidate[] | null>(null);
  const [loadingReview, setLoadingReview] = useState(false);
  const [confirmingDiscard, setConfirmingDiscard] = useState(false);
  const runRef = useRef<AbortController | null>(null);
  // Async steps check this so nothing continues, or uploads, after closing.
  const closedRef = useRef(false);
  const startedWithFilesRef = useRef(false);
  // Where the candidates under review came from, for analytics.
  const importKindRef = useRef<ExportFileFormat | 'smart'>('json');

  // Also stops work when the parent closes the dialog or it unmounts, such as
  // after navigating away mid-run.
  useEffect(() => {
    if (!open) {
      return;
    }

    closedRef.current = false;

    return () => {
      closedRef.current = true;
      runRef.current?.abort();
    };
  }, [open]);

  // Files picked before opening go through the same checks as ones dropped
  // here. Strict Mode remounts before any upload starts, so starting once is
  // enough: the remount reopens the dialog before the first await resolves.
  const selectInitialFiles = useEffectEvent(() => {
    void handleSelectFiles(initialFiles);
  });

  useEffect(() => {
    if (!open || startedWithFilesRef.current || initialFiles.length === 0) {
      return;
    }

    startedWithFilesRef.current = true;
    selectInitialFiles();
  }, [open, initialFiles]);

  const smartImportAvailability = getAvailability(status);

  function close() {
    closedRef.current = true;
    runRef.current?.abort();
    onOpenChange(false);
  }

  function requestClose() {
    if (importSubscriptions.isPending) {
      return;
    }

    if (step === 'review' && review?.touched) {
      setConfirmingDiscard(true);
      return;
    }

    close();
  }

  async function openReview(
    candidates: ImportCandidate[],
    signal?: AbortSignal,
  ) {
    let context: ReviewContext;

    try {
      // Fetched fresh so duplicates and new categories reflect earlier imports.
      const [subscriptions, categories] = await Promise.all([
        queryClient.fetchQuery(
          subscriptionsQueryOptions({ collectionId: collection.id }),
        ),
        queryClient.fetchQuery(categoriesQueryOptions(collection.id)),
      ]);

      context = {
        subscriptions,
        categories: categories.map((category) => category.name),
      };
    } catch {
      if (!closedRef.current && !signal?.aborted) {
        setUnreviewed(candidates);
        setStep('reviewFailed');
      }

      return;
    }

    if (closedRef.current || signal?.aborted) {
      return;
    }

    setUnreviewed(null);
    setReviewContext(context);
    setReview(createReviewState(candidates, context));
    setStep('review');
  }

  async function startFileImport(file: File, format: ExportFileFormat) {
    setAttachedFiles([]);
    setLastRunFailed(false);

    let candidates: ImportCandidate[];

    try {
      candidates = candidatesFromExport(
        parseSubscriptionImport({ content: await file.text(), format }),
      );
    } catch (error) {
      // Parser errors explain what's wrong with the file.
      setNotice({
        tone: 'error',
        message:
          error instanceof Error
            ? error.message
            : 'This file couldn’t be read.',
      });
      return;
    }

    if (candidates.length === 0) {
      setNotice({
        tone: 'info',
        message: 'This file doesn’t contain any subscriptions.',
      });
      return;
    }

    importKindRef.current = format;
    await openReview(candidates);
  }

  async function checkPageCount(files: File[]): Promise<string | null> {
    let pages = 0;

    for (const file of files) {
      const mediaType = getSmartImportMediaType(file);

      if (!mediaType) {
        continue;
      }

      try {
        pages += await countPages({
          name: file.name,
          mediaType,
          bytes: new Uint8Array(await file.arrayBuffer()),
        });
      } catch (error) {
        return error instanceof UnreadableFileError
          ? error.message
          : `${file.name} couldn’t be read.`;
      }

      if (pages > SMART_IMPORT_MAX_PAGES) {
        return TOO_MANY_PAGES_MESSAGE;
      }
    }

    return null;
  }

  function showRunFailure(message: string) {
    setLastRunFailed(true);
    setNotice({ tone: 'error', message });
    setStep('upload');
  }

  async function runSmartImport(files: File[]) {
    const controller = new AbortController();
    runRef.current = controller;
    setNotice(null);
    setStep('running');

    const formData = new FormData();
    formData.set('collectionId', collection.id);

    for (const file of files) {
      formData.append('files', file);
    }

    try {
      let response: SmartImportResponse;

      try {
        response = await smartImport({
          data: formData,
          signal: controller.signal,
        });
      } catch {
        // Anything thrown here is a network or platform failure, whose
        // message isn't meant for people. Cancelling also lands here.
        if (!controller.signal.aborted) {
          showRunFailure(SMART_IMPORT_FAILED_MESSAGE);
        }

        return;
      } finally {
        void queryClient.invalidateQueries({
          queryKey: smartImportStatusQueryKey,
        });
      }

      // The user cancelled while the response was on its way.
      if (controller.signal.aborted) {
        return;
      }

      if (response.status === 'failed') {
        showRunFailure(response.message);
        return;
      }

      setLastRunFailed(false);

      if (response.candidates.length === 0) {
        setNotice({
          tone: 'info',
          message: 'We couldn’t find any subscriptions in these files.',
        });
        setStep('upload');
        return;
      }

      importKindRef.current = 'smart';
      await openReview(response.candidates, controller.signal);
    } finally {
      // A newer run may have started after this one was cancelled.
      if (runRef.current === controller) {
        runRef.current = null;
      }
    }
  }

  async function handleSelectFiles(files: File[]) {
    setNotice(null);
    const selection = classifyFileSelection(files);

    if (selection.path === 'invalid') {
      setNotice({ tone: 'error', message: selection.message });
      return;
    }

    if (selection.path === 'file') {
      await startFileImport(selection.file, selection.format);
      return;
    }

    if (!smartImportAvailability.enabled) {
      setNotice({ tone: 'error', message: smartImportAvailability.message });
      return;
    }

    setChecking(true);
    const pageError = await checkPageCount(selection.files);
    setChecking(false);

    if (closedRef.current) {
      return;
    }

    if (pageError) {
      setNotice({ tone: 'error', message: pageError });
      return;
    }

    setAttachedFiles(selection.files);
    setLastRunFailed(false);
    await runSmartImport(selection.files);
  }

  function handleCancelRun() {
    runRef.current?.abort();
    runRef.current = null;
    setStep('upload');
  }

  async function handleRetryReview() {
    if (!unreviewed) {
      return;
    }

    setLoadingReview(true);
    await openReview(unreviewed);
    setLoadingReview(false);
  }

  function handleImport(items: ImportSubscriptionItem[]) {
    importSubscriptions.mutate(
      { collectionId: collection.id, items },
      {
        onSuccess: (result) => {
          track('import_completed', {
            kind: importKindRef.current,
            count: result.subscriptionsImported,
          });
          toast.success(formatImportResult(result));
          onImported?.();
          onOpenChange(false);
        },
      },
    );
  }

  return (
    <Dialog
      open={open}
      onOpenChangeComplete={onOpenChangeComplete}
      onOpenChange={(nextOpen) => {
        if (nextOpen) {
          onOpenChange(true);
        } else {
          requestClose();
        }
      }}
    >
      <DialogContent
        className="flex max-h-[min(88vh,56rem)] flex-col gap-0 p-0 sm:max-w-5xl"
        finalFocus={finalFocus}
      >
        <DialogHeader className="px-6 pt-6 pb-5">
          <DialogTitle>Import subscriptions to {collection.name}</DialogTitle>
          <DialogDescription>
            {step === 'review'
              ? 'Choose what to import and fix anything that’s wrong. Nothing is saved until you import.'
              : 'Upload an EverySub export, or find subscriptions in statements, receipts, and screenshots.'}
          </DialogDescription>
        </DialogHeader>

        {step === 'upload' && (
          <ImportUploadStep
            smartImport={smartImportAvailability}
            attachedFiles={attachedFiles}
            notice={notice}
            checking={checking}
            runLabel={lastRunFailed ? 'Retry' : 'Find subscriptions'}
            canRun={smartImportAvailability.enabled}
            onSelectFiles={(files) => void handleSelectFiles(files)}
            onRemoveFile={(file) =>
              setAttachedFiles((files) =>
                files.filter((candidate) => candidate !== file),
              )
            }
            onRun={() => void runSmartImport(attachedFiles)}
          />
        )}

        {/* Always mounted so screen readers announce the text when it changes. */}
        <p role="status" className="sr-only">
          {step === 'running' ? RUNNING_MESSAGE : ''}
        </p>

        {step === 'running' && (
          <div className="flex min-h-72 flex-col items-center justify-center gap-5 px-6 pb-10 text-center">
            <Spinner
              role="presentation"
              aria-label={undefined}
              className="size-6 text-muted-foreground"
            />
            <p aria-hidden className="max-w-sm text-pretty">
              {RUNNING_MESSAGE}
            </p>
            {/* The control that started the run is gone, so focus moves here. */}
            <Button variant="outline" autoFocus onClick={handleCancelRun}>
              Cancel
            </Button>
          </div>
        )}

        {step === 'reviewFailed' && unreviewed && (
          <div
            role="alert"
            className="flex min-h-72 flex-col items-center justify-center gap-5 px-6 pb-10 text-center"
          >
            <CircleAlertIcon className="size-6 text-destructive" aria-hidden />
            <p className="max-w-sm text-pretty">
              {formatReviewFailedMessage(unreviewed.length, collection.name)}
            </p>
            {/* The control that led here is gone, so focus moves here. */}
            <Button
              autoFocus
              disabled={loadingReview}
              onClick={() => void handleRetryReview()}
            >
              {loadingReview ? 'Loading…' : 'Try again'}
            </Button>
          </div>
        )}

        {step === 'review' && review && reviewContext && (
          <ImportReviewStep
            collectionId={collection.id}
            review={review}
            onReviewChange={(update) =>
              setReview((current) => (current ? update(current) : current))
            }
            context={reviewContext}
            isImporting={importSubscriptions.isPending}
            importFailed={importSubscriptions.isError}
            onCancel={requestClose}
            onImport={handleImport}
          />
        )}

        <AlertDialog
          open={confirmingDiscard}
          onOpenChange={setConfirmingDiscard}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Discard this import?</AlertDialogTitle>
              <AlertDialogDescription>
                Your selections and edits will be lost. Nothing has been
                imported.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Keep reviewing</AlertDialogCancel>
              <AlertDialogAction
                variant="destructive"
                onClick={() => {
                  setConfirmingDiscard(false);
                  close();
                }}
              >
                Discard
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </DialogContent>
    </Dialog>
  );
}

function formatReviewFailedMessage(count: number, collectionName: string) {
  const found = count === 1 ? '1 subscription' : `${count} subscriptions`;

  return `Found ${found}, but couldn’t load ${collectionName} to review the results. Try again to continue.`;
}

function getAvailability(
  status: SmartImportStatus | undefined,
): SmartImportAvailability {
  // Until the status loads, let the server decide.
  if (!status) {
    return { enabled: true, usageMessage: null };
  }

  if (!status.configured || !status.usage) {
    return {
      enabled: false,
      reason: 'unconfigured',
      message: 'Smart import isn’t configured.',
    };
  }

  const now = new Date();
  const message = getSmartImportUsageMessage(status.usage, now);

  if (status.usage.status !== 'available') {
    return {
      enabled: false,
      reason: 'limited',
      message: message ?? 'Smart import isn’t available right now.',
    };
  }

  return { enabled: true, usageMessage: message };
}
