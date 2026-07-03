import { exportTransactionsToCsv } from '$lib/server/csv';
import { listTransactions } from '$lib/server/transactions';

export function GET() {
  const csv = exportTransactionsToCsv(listTransactions());
  return new Response(csv, {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="krypto-transactions.csv"`
    }
  });
}
