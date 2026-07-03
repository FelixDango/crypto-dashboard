import { fail } from '@sveltejs/kit';
import { ZodError } from 'zod';
import { exportTransactionsToCsv, importTransactionsFromCsv } from '$lib/server/csv';
import {
  createTransaction,
  deleteTransaction,
  listTransactions,
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
    transactions: listTransactions(),
    settings: getAppSettings()
  };
}

export const actions = {
  create: async ({ request }) => {
    try {
      createTransaction(parseTransactionForm(await request.formData()));
      return { success: true };
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
      return { success: true };
    } catch (error) {
      return fail(400, { error: actionError(error), intent: 'update' });
    }
  },

  delete: async ({ request }) => {
    const formData = await request.formData();
    const id = formData.get('id')?.toString();
    if (!id) return fail(400, { error: 'Missing transaction id.', intent: 'delete' });

    deleteTransaction(id);
    return { success: true };
  },

  importCsv: async ({ request }) => {
    const formData = await request.formData();
    const file = formData.get('csv_file');
    if (!(file instanceof File)) {
      return fail(400, { error: 'CSV file is required.', intent: 'importCsv' });
    }

    try {
      const result = importTransactionsFromCsv(await file.text());
      return { success: true, imported: result.imported };
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
