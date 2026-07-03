import { fail } from '@sveltejs/kit';
import { ZodError } from 'zod';
import {
  exportTransactionsToCsv,
  importTransactionsFromCsv,
  previewTransactionsCsv
} from '$lib/server/csv';
import {
  createTransaction,
  deleteTransaction,
  listTransactions,
  listTransactionsWithAssets,
  updateTransaction
} from '$lib/server/transactions';
import { getAppSettings } from '$lib/server/settings';
import { getErrorMessage } from '$lib/server/errors';
import { parseTransactionForm } from '$lib/validation/transaction';

function actionError(error: unknown) {
  if (error instanceof ZodError) {
    return error.issues.map((issue) => issue.message).join(' ');
  }
  return getErrorMessage(error);
}

export function load() {
  return {
    transactions: listTransactionsWithAssets(),
    settings: getAppSettings()
  };
}

export const actions = {
  create: async ({ request }) => {
    try {
      createTransaction(parseTransactionForm(await request.formData()));
      return { success: true, intent: 'create' };
    } catch (error) {
      return fail(400, { error: actionError(error), intent: 'create' });
    }
  },

  update: async ({ request }) => {
    const formData = await request.formData();
    const id = formData.get('id')?.toString();
    if (!id) return fail(400, { error: 'Missing transaction id.', intent: 'update' });

    try {
      updateTransaction(id, parseTransactionForm(formData));
      return { success: true, intent: 'update' };
    } catch (error) {
      return fail(400, { error: actionError(error), intent: 'update' });
    }
  },

  delete: async ({ request }) => {
    const formData = await request.formData();
    const id = formData.get('id')?.toString();
    if (!id) return fail(400, { error: 'Missing transaction id.', intent: 'delete' });

    deleteTransaction(id);
    return { success: true, intent: 'delete' };
  },

  previewCsv: async ({ request }) => {
    const formData = await request.formData();
    const file = formData.get('csv_file');
    if (!(file instanceof File)) {
      return fail(400, { error: 'CSV file is required.', intent: 'previewCsv' });
    }

    try {
      const csvContent = await file.text();
      return {
        success: true,
        intent: 'previewCsv',
        filename: file.name,
        csvContent,
        preview: previewTransactionsCsv(csvContent)
      };
    } catch (error) {
      return fail(400, { error: actionError(error), intent: 'previewCsv' });
    }
  },

  importCsv: async ({ request }) => {
    const formData = await request.formData();
    const content = formData.get('csv_content')?.toString();
    const file = formData.get('csv_file');
    const filename =
      formData.get('filename')?.toString() || (file instanceof File ? file.name : null);

    if (!content && !(file instanceof File)) {
      return fail(400, { error: 'CSV file is required.', intent: 'importCsv' });
    }

    try {
      const result = importTransactionsFromCsv(content || (await (file as File).text()), filename);
      return {
        success: true,
        intent: 'importCsv',
        imported: result.imported,
        duplicates: result.duplicates,
        batchId: result.batchId
      };
    } catch (error) {
      return fail(400, { error: actionError(error), intent: 'importCsv' });
    }
  },

  exportCsv: async () => {
    return {
      csv: exportTransactionsToCsv(listTransactions())
    };
  }
};
