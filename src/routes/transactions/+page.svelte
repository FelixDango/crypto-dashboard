<script lang="ts">
  import { enhance } from '$app/forms';
  import type { SubmitFunction } from '@sveltejs/kit';
  import Decimal from 'decimal.js';
  import { Download, Pencil, Plus, Search, Trash2, TriangleAlert, Upload, X } from '@lucide/svelte';
  import AssetSearch from '$lib/components/AssetSearch.svelte';
  import CryptoIcon from '$lib/components/CryptoIcon.svelte';
  import { formatCurrency, formatCrypto, formatDate } from '$lib/format';
  import type { TransactionRecord } from '$lib/types';

  type AssetChoice = {
    id: string;
    provider: string;
    providerCoinId: string;
    symbol: string;
    name: string;
    imageUrl: string | null;
  };

  type CsvPreview = {
    totalRows: number;
    importableRows: number;
    duplicateRows: number;
    rows: Array<{
      index: number;
      type: string;
      assetSymbol: string;
      assetName: string;
      quantity: string;
      fiatAmount: string;
      fiatCurrency: 'EUR' | 'USD';
      transactionDate: string;
      duplicate: boolean;
    }>;
  };

  export let data: {
    transactions: TransactionRecord[];
    settings: { baseCurrency: 'EUR' | 'USD' };
  };
  export let form: {
    error?: string;
    success?: boolean;
    intent?: string;
    imported?: number;
    duplicates?: number;
    batchId?: string;
    filename?: string;
    csvContent?: string;
    preview?: CsvPreview;
  } | null;

  let query = '';
  let typeFilter = 'all';
  let showAdd = false;
  let showImport = false;
  let editing: TransactionRecord | null = null;
  let deleting: TransactionRecord | null = null;
  let selectedAddAsset: AssetChoice | null = null;
  let addType: 'buy' | 'sell' = 'buy';
  let addDate = defaultDate();
  let addQuantity = '';
  let addFiatAmount = '';
  let addFiatCurrency: 'EUR' | 'USD' = data.settings.baseCurrency;
  let addFeeAmount = '';
  let addFeeCurrency: 'EUR' | 'USD' = data.settings.baseCurrency;

  $: filtered = data.transactions.filter((transaction) => {
    const text =
      `${transaction.assetSymbol} ${transaction.assetName} ${transaction.notes ?? ''}`.toLowerCase();
    const matchesQuery = text.includes(query.toLowerCase());
    const matchesType = typeFilter === 'all' || transaction.type === typeFilter;
    return matchesQuery && matchesType;
  });
  $: openQuantityByAsset = data.transactions.reduce((balances, transaction) => {
    const current = balances.get(transaction.assetId) ?? new Decimal(0);
    const next =
      transaction.type === 'buy'
        ? current.plus(transaction.quantity)
        : current.minus(transaction.quantity);
    balances.set(transaction.assetId, next);
    return balances;
  }, new Map<string, Decimal>());
  $: addUnitCost = unitCost(addQuantity, addFiatAmount, addFeeAmount);
  $: sellWarning = sellQuantityWarning();
  $: successMessage = form?.success ? successCopy(form) : null;
  $: importPreview = form?.intent === 'previewCsv' ? form.preview : null;
  $: previewRows = importPreview?.rows.slice(0, 8) ?? [];

  function closeOnSuccess(close: () => void): SubmitFunction {
    return () => {
      return async ({ result, update }) => {
        await update();
        if (result.type === 'success') close();
      };
    };
  }

  function defaultDate() {
    return new Date().toISOString().slice(0, 10);
  }

  function openAdd() {
    selectedAddAsset = null;
    addType = 'buy';
    addDate = defaultDate();
    addQuantity = '';
    addFiatAmount = '';
    addFiatCurrency = data.settings.baseCurrency;
    addFeeAmount = '';
    addFeeCurrency = data.settings.baseCurrency;
    showAdd = true;
  }

  function decimalValue(value: string): Decimal | null {
    try {
      const cleaned = value.trim();
      if (!cleaned) return null;
      const decimal = new Decimal(cleaned);
      return decimal.isFinite() ? decimal : null;
    } catch {
      return null;
    }
  }

  function unitCost(quantityValue: string, fiatValue: string, feeValue: string): string | null {
    const quantity = decimalValue(quantityValue);
    const fiat = decimalValue(fiatValue);
    const fee = decimalValue(feeValue) ?? new Decimal(0);
    if (!quantity || !fiat || quantity.lte(0)) return null;
    return fiat.plus(fee).div(quantity).toDecimalPlaces(8).toString();
  }

  function sellQuantityWarning(): string | null {
    if (addType !== 'sell' || !selectedAddAsset) return null;
    const quantity = decimalValue(addQuantity);
    if (!quantity) return null;
    const available = openQuantityByAsset.get(selectedAddAsset.id) ?? new Decimal(0);
    if (quantity.gt(available)) {
      return `Recorded balance is ${formatCrypto(available.toString())} ${selectedAddAsset.symbol}.`;
    }
    return null;
  }

  function successCopy(result: NonNullable<typeof form>): string {
    if (result.intent === 'create') return 'Transaction saved.';
    if (result.intent === 'update') return 'Transaction updated.';
    if (result.intent === 'delete') return 'Transaction deleted.';
    if (result.intent === 'importCsv') {
      return `Imported ${result.imported ?? 0} rows. Skipped ${result.duplicates ?? 0} duplicates.`;
    }
    return 'Done.';
  }
</script>

<section class="page">
  <div class="page-header">
    <div class="page-title">
      <h1>Transactions</h1>
      <p class="muted">{data.transactions.length} manual entries</p>
    </div>
    <div class="toolbar">
      <a class="btn" href="/api/export?type=transactions">
        <Download size={17} />
        CSV
      </a>
      <button class="btn" type="button" on:click={() => (showImport = true)}>
        <Upload size={17} />
        Import
      </button>
      <button class="btn primary" type="button" on:click={openAdd}>
        <Plus size={17} />
        Add
      </button>
    </div>
  </div>

  {#if form?.error}
    <div class="notice">{form.error}</div>
  {/if}

  {#if successMessage}
    <div class="notice success">{successMessage}</div>
  {/if}

  <section class="card controls">
    <div class="search-control">
      <Search size={17} />
      <input bind:value={query} placeholder="Filter by asset or note" />
    </div>
    <select bind:value={typeFilter} aria-label="Filter by transaction type">
      <option value="all">All types</option>
      <option value="buy">Buys</option>
      <option value="sell">Sells</option>
    </select>
  </section>

  <section class="card list-card">
    {#if filtered.length === 0}
      <div class="empty-state">
        <h2>No matching transactions</h2>
        <button class="btn primary" type="button" on:click={() => (showAdd = true)}
          >Add transaction</button
        >
      </div>
    {:else}
      <div class="table-wrap mobile-cards">
        <table class="mobile-card-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Asset</th>
              <th>Type</th>
              <th>Quantity</th>
              <th>Fiat</th>
              <th>Fee</th>
              <th>Notes</th>
              <th aria-label="Actions"></th>
            </tr>
          </thead>
          <tbody>
            {#each filtered as transaction}
              <tr>
                <td data-label="Date">{formatDate(transaction.transactionDate)}</td>
                <td class="primary-cell" data-label="Asset">
                  <div class="transaction-asset-cell">
                    <CryptoIcon
                      src={transaction.asset?.imageUrl}
                      symbol={transaction.assetSymbol}
                      name={transaction.assetName}
                      size={28}
                    />
                    <span>
                      <strong>{transaction.assetSymbol}</strong>
                      <span class="muted asset-name">{transaction.assetName}</span>
                    </span>
                  </div>
                </td>
                <td data-label="Type">
                  <span
                    class:type-buy={transaction.type === 'buy'}
                    class:type-sell={transaction.type === 'sell'}
                  >
                    {transaction.type}
                  </span>
                </td>
                <td data-label="Quantity">{formatCrypto(transaction.quantity)}</td>
                <td data-label="Fiat"
                  >{formatCurrency(transaction.fiatAmount, transaction.fiatCurrency)}</td
                >
                <td data-label="Fee">
                  {#if transaction.feeAmount}
                    {formatCurrency(
                      transaction.feeAmount,
                      transaction.feeCurrency ?? transaction.fiatCurrency
                    )}
                  {:else}
                    <span class="muted">-</span>
                  {/if}
                </td>
                <td data-label="Notes" class="notes">{transaction.notes ?? '-'}</td>
                <td data-label="Actions">
                  <div class="row-actions">
                    <button
                      class="btn icon"
                      type="button"
                      title="Edit"
                      on:click={() => (editing = transaction)}
                    >
                      <Pencil size={16} />
                    </button>
                    <button
                      class="btn icon danger"
                      type="button"
                      title="Delete"
                      on:click={() => (deleting = transaction)}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {/if}
  </section>
</section>

{#if showAdd}
  <div class="modal-backdrop" role="presentation">
    <div class="modal" role="dialog" aria-modal="true" aria-labelledby="add-title">
      <div class="modal-header">
        <h2 id="add-title">Add transaction</h2>
        <button class="btn icon" type="button" on:click={() => (showAdd = false)}
          ><X size={17} /></button
        >
      </div>
      <form method="POST" action="?/create" use:enhance={closeOnSuccess(() => (showAdd = false))}>
        <div class="field-grid">
          <div class="field full">
            <AssetSearch on:select={(event) => (selectedAddAsset = event.detail)} />
          </div>
          <div class="field">
            <label class="field-label" for="type">Type</label>
            <select id="type" name="type" bind:value={addType}>
              <option value="buy">Buy</option>
              <option value="sell">Sell</option>
            </select>
          </div>
          <div class="field">
            <label class="field-label" for="date">Date</label>
            <input id="date" name="transaction_date" type="date" bind:value={addDate} required />
          </div>
          <div class="field">
            <label class="field-label" for="quantity">Quantity</label>
            <input
              id="quantity"
              name="quantity"
              inputmode="decimal"
              bind:value={addQuantity}
              required
            />
          </div>
          <div class="field">
            <label class="field-label" for="fiat">Fiat amount</label>
            <input
              id="fiat"
              name="fiat_amount"
              inputmode="decimal"
              bind:value={addFiatAmount}
              required
            />
          </div>
          <div class="field">
            <label class="field-label" for="currency">Fiat currency</label>
            <select id="currency" name="fiat_currency" bind:value={addFiatCurrency}>
              <option value="EUR">EUR</option>
              <option value="USD">USD</option>
            </select>
          </div>
          <div class="field">
            <label class="field-label" for="fee">Fee</label>
            <input id="fee" name="fee_amount" inputmode="decimal" bind:value={addFeeAmount} />
          </div>
          <div class="field">
            <label class="field-label" for="fee-currency">Fee currency</label>
            <select id="fee-currency" name="fee_currency" bind:value={addFeeCurrency}>
              <option value="EUR">EUR</option>
              <option value="USD">USD</option>
            </select>
          </div>
          {#if addUnitCost || sellWarning}
            <div class="field full entry-preview" class:warning={Boolean(sellWarning)}>
              {#if sellWarning}
                <TriangleAlert size={16} />
                <span>{sellWarning}</span>
              {:else if addUnitCost}
                <span>Unit cost preview</span>
                <strong>{formatCurrency(addUnitCost, addFiatCurrency)}</strong>
              {/if}
            </div>
          {/if}
          <div class="field full">
            <label class="field-label" for="notes">Notes</label>
            <textarea id="notes" name="notes"></textarea>
          </div>
        </div>
        <div class="modal-actions">
          <button class="btn" type="button" on:click={() => (showAdd = false)}>Cancel</button>
          <button class="btn primary" type="submit">Save</button>
        </div>
      </form>
    </div>
  </div>
{/if}

{#if editing}
  <div class="modal-backdrop" role="presentation">
    <div class="modal" role="dialog" aria-modal="true" aria-labelledby="edit-title">
      <div class="modal-header">
        <h2 id="edit-title">Edit transaction</h2>
        <button class="btn icon" type="button" on:click={() => (editing = null)}
          ><X size={17} /></button
        >
      </div>
      <form method="POST" action="?/update" use:enhance={closeOnSuccess(() => (editing = null))}>
        <input type="hidden" name="id" value={editing.id} />
        <div class="field-grid">
          <div class="field full">
            <AssetSearch
              initialProvider={editing.assetId.split(':')[0]}
              initialProviderCoinId={editing.assetId.split(':').slice(1).join(':')}
              initialSymbol={editing.assetSymbol}
              initialName={editing.assetName}
              initialImageUrl={editing.asset?.imageUrl}
            />
          </div>
          <div class="field">
            <label class="field-label" for="edit-type">Type</label>
            <select id="edit-type" name="type">
              <option value="buy" selected={editing.type === 'buy'}>Buy</option>
              <option value="sell" selected={editing.type === 'sell'}>Sell</option>
            </select>
          </div>
          <div class="field">
            <label class="field-label" for="edit-date">Date</label>
            <input
              id="edit-date"
              name="transaction_date"
              type="date"
              value={editing.transactionDate.slice(0, 10)}
              required
            />
          </div>
          <div class="field">
            <label class="field-label" for="edit-quantity">Quantity</label>
            <input
              id="edit-quantity"
              name="quantity"
              inputmode="decimal"
              value={editing.quantity}
              required
            />
          </div>
          <div class="field">
            <label class="field-label" for="edit-fiat">Fiat amount</label>
            <input
              id="edit-fiat"
              name="fiat_amount"
              inputmode="decimal"
              value={editing.fiatAmount}
              required
            />
          </div>
          <div class="field">
            <label class="field-label" for="edit-currency">Fiat currency</label>
            <select id="edit-currency" name="fiat_currency">
              <option value="EUR" selected={editing.fiatCurrency === 'EUR'}>EUR</option>
              <option value="USD" selected={editing.fiatCurrency === 'USD'}>USD</option>
            </select>
          </div>
          <div class="field">
            <label class="field-label" for="edit-fee">Fee</label>
            <input
              id="edit-fee"
              name="fee_amount"
              inputmode="decimal"
              value={editing.feeAmount ?? ''}
            />
          </div>
          <div class="field">
            <label class="field-label" for="edit-fee-currency">Fee currency</label>
            <select id="edit-fee-currency" name="fee_currency">
              <option value="EUR" selected={(editing.feeCurrency ?? editing.fiatCurrency) === 'EUR'}
                >EUR</option
              >
              <option value="USD" selected={(editing.feeCurrency ?? editing.fiatCurrency) === 'USD'}
                >USD</option
              >
            </select>
          </div>
          <div class="field full">
            <label class="field-label" for="edit-notes">Notes</label>
            <textarea id="edit-notes" name="notes">{editing.notes ?? ''}</textarea>
          </div>
        </div>
        <div class="modal-actions">
          <button class="btn" type="button" on:click={() => (editing = null)}>Cancel</button>
          <button class="btn primary" type="submit">Update</button>
        </div>
      </form>
    </div>
  </div>
{/if}

{#if deleting}
  <div class="modal-backdrop" role="presentation">
    <div class="modal confirm" role="dialog" aria-modal="true" aria-labelledby="delete-title">
      <div class="modal-header">
        <h2 id="delete-title">Delete transaction</h2>
        <button class="btn icon" type="button" on:click={() => (deleting = null)}
          ><X size={17} /></button
        >
      </div>
      <p class="muted">
        Delete {deleting.assetSymbol}
        {deleting.type} from {formatDate(deleting.transactionDate)}?
      </p>
      <form method="POST" action="?/delete" use:enhance={closeOnSuccess(() => (deleting = null))}>
        <input type="hidden" name="id" value={deleting.id} />
        <div class="modal-actions">
          <button class="btn" type="button" on:click={() => (deleting = null)}>Cancel</button>
          <button class="btn danger" type="submit">Delete</button>
        </div>
      </form>
    </div>
  </div>
{/if}

{#if showImport}
  <div class="modal-backdrop" role="presentation">
    <div class="modal confirm" role="dialog" aria-modal="true" aria-labelledby="import-title">
      <div class="modal-header">
        <h2 id="import-title">Import CSV</h2>
        <button class="btn icon" type="button" on:click={() => (showImport = false)}
          ><X size={17} /></button
        >
      </div>
      <form method="POST" action="?/previewCsv" enctype="multipart/form-data" use:enhance>
        <div class="field">
          <label class="field-label" for="csv-file">CSV file</label>
          <input id="csv-file" name="csv_file" type="file" accept=".csv,text/csv" required />
        </div>
        <div class="modal-actions">
          <button class="btn" type="button" on:click={() => (showImport = false)}>Cancel</button>
          <button class="btn primary" type="submit">Preview</button>
        </div>
      </form>

      {#if importPreview && form?.csvContent}
        <div class="import-preview">
          <div class="preview-summary">
            <strong>{importPreview.importableRows} ready</strong>
            <span>{importPreview.duplicateRows} duplicates · {importPreview.totalRows} total</span>
          </div>
          <div class="table-wrap preview-table">
            <table>
              <thead>
                <tr>
                  <th>Row</th>
                  <th>Asset</th>
                  <th>Type</th>
                  <th>Quantity</th>
                  <th>Fiat</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {#each previewRows as row}
                  <tr>
                    <td>{row.index}</td>
                    <td>{row.assetSymbol}</td>
                    <td>{row.type}</td>
                    <td>{row.quantity}</td>
                    <td>{formatCurrency(row.fiatAmount, row.fiatCurrency)}</td>
                    <td>{row.duplicate ? 'Duplicate' : 'Ready'}</td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
          <form
            method="POST"
            action="?/importCsv"
            use:enhance={closeOnSuccess(() => (showImport = false))}
          >
            <input type="hidden" name="filename" value={form.filename ?? ''} />
            <textarea class="hidden-content" name="csv_content">{form.csvContent}</textarea>
            <div class="modal-actions">
              <button class="btn" type="button" on:click={() => (showImport = false)}>Cancel</button
              >
              <button class="btn primary" type="submit">Import ready rows</button>
            </div>
          </form>
        </div>
      {/if}
    </div>
  </div>
{/if}

<style>
  .toolbar,
  .row-actions {
    display: flex;
    gap: 0.5rem;
  }

  .controls {
    align-items: center;
    display: grid;
    gap: 0.8rem;
    grid-template-columns: minmax(0, 1fr) 180px;
    margin-bottom: 1rem;
  }

  .search-control {
    align-items: center;
    background: var(--surface-soft);
    border: 1px solid var(--border);
    border-radius: 8px;
    display: flex;
    gap: 0.6rem;
    padding: 0 0.8rem;
  }

  .search-control input {
    background: transparent;
    border: 0;
    outline: 0;
  }

  .list-card {
    padding: 0;
  }

  .transaction-asset-cell {
    align-items: center;
    display: flex;
    gap: 0.65rem;
  }

  .transaction-asset-cell > span {
    display: grid;
  }

  .asset-name {
    display: block;
    font-size: 0.82rem;
    margin-top: 0.15rem;
  }

  .type-buy,
  .type-sell {
    border-radius: 999px;
    display: inline-flex;
    font-size: 0.78rem;
    font-weight: 800;
    padding: 0.18rem 0.5rem;
    text-transform: uppercase;
  }

  .type-buy {
    background: rgba(34, 197, 94, 0.14);
    color: var(--positive);
  }

  .type-sell {
    background: rgba(251, 113, 133, 0.14);
    color: var(--negative);
  }

  .notes {
    color: var(--muted);
    max-width: 280px;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .confirm {
    max-width: 460px;
  }

  .entry-preview {
    align-items: center;
    border: 1px solid var(--border);
    border-radius: 8px;
    color: var(--muted);
    display: flex;
    gap: 0.5rem;
    padding: 0.7rem 0.75rem;
  }

  .entry-preview strong {
    color: var(--text);
  }

  .entry-preview.warning {
    border-color: rgba(245, 158, 11, 0.36);
    color: #f8d891;
  }

  .notice.success {
    background: rgba(34, 197, 94, 0.12);
    border-color: rgba(34, 197, 94, 0.28);
    color: #9be7b4;
    margin-bottom: 1rem;
  }

  .import-preview {
    border-top: 1px solid var(--border);
    display: grid;
    gap: 0.8rem;
    margin-top: 1rem;
    padding-top: 1rem;
  }

  .preview-summary {
    display: grid;
    gap: 0.2rem;
  }

  .preview-summary span {
    color: var(--muted);
  }

  .preview-table {
    max-height: 260px;
  }

  .preview-table table {
    min-width: 520px;
  }

  .hidden-content {
    height: 1px;
    opacity: 0;
    pointer-events: none;
    position: absolute;
    width: 1px;
  }

  @media (max-width: 720px) {
    .controls {
      grid-template-columns: 1fr;
    }

    .toolbar {
      display: grid;
      grid-template-columns: 1fr;
    }
  }
</style>
