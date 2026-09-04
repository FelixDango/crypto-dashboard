<script lang="ts">
  import { enhance } from '$app/forms';
  import { replaceState } from '$app/navigation';
  import { page } from '$app/stores';
  import type { SubmitFunction } from '@sveltejs/kit';
  import { onMount, tick } from 'svelte';
  import Decimal from 'decimal.js';
  import {
    Download,
    Ellipsis,
    Pencil,
    Plus,
    Search,
    Trash2,
    TriangleAlert,
    Upload,
    X
  } from '@lucide/svelte';
  import AssetSearch from '$lib/components/AssetSearch.svelte';
  import CryptoIcon from '$lib/components/CryptoIcon.svelte';
  import PrivacyValue from '$lib/components/PrivacyValue.svelte';
  import { formatCurrency, formatCrypto, formatDate } from '$lib/format';
  import { calculateTransactionPreview } from '$lib/portfolio/transactionPreview';
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
  let returnFocus: HTMLElement | null = null;
  let submittingIntent: string | null = null;

  $: filtered = data.transactions.filter((transaction) => {
    const text =
      `${transaction.assetSymbol} ${transaction.assetName} ${transaction.notes ?? ''}`.toLowerCase();
    const matchesQuery = text.includes(query.toLowerCase());
    const matchesType = typeFilter === 'all' || transaction.type === typeFilter;
    return matchesQuery && matchesType;
  });
  $: showFilters = data.transactions.length > 8;
  $: showFees = data.transactions.some((transaction) => {
    if (!transaction.feeAmount) return false;
    try {
      return new Decimal(transaction.feeAmount).gt(0);
    } catch {
      return false;
    }
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
  $: addPreview = calculateTransactionPreview(addType, addQuantity, addFiatAmount, addFeeAmount);
  $: sellWarning = sellQuantityWarning();
  $: successMessage = form?.success ? successCopy(form) : null;
  $: importPreview = form?.intent === 'previewCsv' ? form.preview : null;
  $: previewRows = importPreview?.rows.slice(0, 8) ?? [];
  $: addError = errorFor(form, ['create']);
  $: editError = errorFor(form, ['update']);
  $: deleteError = errorFor(form, ['delete']);
  $: importError = errorFor(form, ['previewCsv', 'importCsv']);
  $: errorHandledInDialog = Boolean(
    (showAdd && addError) ||
    (editing && editError) ||
    (deleting && deleteError) ||
    (showImport && importError)
  );

  onMount(() => {
    if ($page.url.searchParams.get('new') !== '1') return;

    const nextUrl = new URL($page.url);
    nextUrl.searchParams.delete('new');
    replaceState(nextUrl, $page.state);
    void openAdd();
  });

  function submitAction(intent: string, close?: () => void): SubmitFunction {
    return () => {
      submittingIntent = intent;
      return async ({ result, update }) => {
        try {
          await update();
          if (result.type === 'success') close?.();
        } finally {
          submittingIntent = null;
        }
      };
    };
  }

  function defaultDate() {
    const now = new Date();
    return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
  }

  function errorFor(result: typeof form, intents: string[]): string | null {
    return result?.error && result.intent && intents.includes(result.intent) ? result.error : null;
  }

  function clearDialogError(...intents: string[]) {
    if (form?.error && form.intent && intents.includes(form.intent)) form = null;
  }

  function rememberFocus() {
    returnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  }

  async function focusDialogControl(id: string) {
    await tick();
    document.getElementById(id)?.focus();
  }

  async function restoreFocus() {
    await tick();
    returnFocus?.focus();
    returnFocus = null;
  }

  async function openAdd() {
    rememberFocus();
    selectedAddAsset = null;
    addType = 'buy';
    addDate = defaultDate();
    addQuantity = '';
    addFiatAmount = '';
    addFiatCurrency = data.settings.baseCurrency;
    addFeeAmount = '';
    addFeeCurrency = data.settings.baseCurrency;
    showAdd = true;
    await focusDialogControl('add-asset-search');
  }

  async function openImport() {
    rememberFocus();
    showImport = true;
    await focusDialogControl('csv-file');
  }

  async function openEdit(transaction: TransactionRecord) {
    rememberFocus();
    editing = transaction;
    await focusDialogControl('edit-asset-search');
  }

  async function openDelete(transaction: TransactionRecord) {
    rememberFocus();
    deleting = transaction;
    await focusDialogControl('confirm-delete');
  }

  function closeAdd() {
    showAdd = false;
    clearDialogError('create');
    void restoreFocus();
  }

  function closeImport() {
    showImport = false;
    clearDialogError('previewCsv', 'importCsv');
    void restoreFocus();
  }

  function closeEdit() {
    editing = null;
    clearDialogError('update');
    void restoreFocus();
  }

  function closeDelete() {
    deleting = null;
    clearDialogError('delete');
    void restoreFocus();
  }

  function handleDialogKeydown(event: KeyboardEvent, close: () => void) {
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
      return;
    }
    if (event.key !== 'Tab') return;

    const dialog = event.currentTarget as HTMLElement;
    const controls = Array.from(
      dialog.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      )
    ).filter((element) => element.offsetParent !== null);
    if (controls.length === 0) return;

    const first = controls[0];
    const last = controls[controls.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
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
      <h1>Activity</h1>
      <p class="muted">{data.transactions.length} manual entries</p>
    </div>
    <div class="toolbar">
      <details class="secondary-actions">
        <summary class="btn" aria-label="More activity actions">
          <Ellipsis size={18} />
          More
        </summary>
        <div class="action-menu">
          <a href="/api/export?type=transactions" aria-label="Export CSV">
            <Download size={17} />
            Export CSV
          </a>
          <button type="button" aria-label="Import CSV" on:click={openImport}>
            <Upload size={17} />
            Import CSV
          </button>
        </div>
      </details>
      <button class="btn primary" type="button" on:click={openAdd}>
        <Plus size={17} />
        Add transaction
      </button>
    </div>
  </div>

  {#if form?.error && !errorHandledInDialog}
    <div class="notice" role="alert">{form.error}</div>
  {/if}

  {#if successMessage}
    <div class="notice success" role="status" aria-live="polite">{successMessage}</div>
  {/if}

  {#if showFilters}
    <section class="controls" aria-label="Activity filters">
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
  {/if}

  <section class="card list-card">
    {#if filtered.length === 0}
      <div class="empty-state">
        <h2>{data.transactions.length === 0 ? 'No activity yet' : 'No matching activity'}</h2>
        <p class="muted">
          {data.transactions.length === 0
            ? 'Add a buy or sell to start building your portfolio history.'
            : 'Try changing the search term or transaction type.'}
        </p>
        <button class="btn primary" type="button" on:click={openAdd}>Add transaction</button>
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
              {#if showFees}<th>Fee</th>{/if}
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
                <td data-label="Quantity">
                  <PrivacyValue value={formatCrypto(transaction.quantity)} kind="quantity" />
                </td>
                <td data-label="Fiat"
                  ><PrivacyValue
                    value={formatCurrency(transaction.fiatAmount, transaction.fiatCurrency)}
                    kind="fiat"
                  /></td
                >
                {#if showFees}
                  <td data-label="Fee">
                    {#if transaction.feeAmount}
                      <PrivacyValue
                        value={formatCurrency(
                          transaction.feeAmount,
                          transaction.feeCurrency ?? transaction.fiatCurrency
                        )}
                        kind="fiat"
                      />
                    {:else}
                      <span class="muted">-</span>
                    {/if}
                  </td>
                {/if}
                <td data-label="Actions">
                  <div class="row-actions">
                    <button
                      class="btn icon"
                      type="button"
                      title="Edit"
                      aria-label={`Edit ${transaction.assetSymbol} transaction`}
                      on:click={() => openEdit(transaction)}
                    >
                      <Pencil size={16} />
                    </button>
                    <button
                      class="btn icon danger"
                      type="button"
                      title="Delete"
                      aria-label={`Delete ${transaction.assetSymbol} transaction`}
                      on:click={() => openDelete(transaction)}
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
    <div
      class="modal"
      role="dialog"
      tabindex="-1"
      aria-modal="true"
      aria-labelledby="add-title"
      aria-describedby={addError ? 'add-error' : undefined}
      on:keydown={(event) => handleDialogKeydown(event, closeAdd)}
    >
      <div class="modal-header">
        <h2 id="add-title">Add transaction</h2>
        <button
          class="btn icon"
          type="button"
          aria-label="Close add transaction"
          on:click={closeAdd}><X size={17} /></button
        >
      </div>
      {#if addError}
        <div class="notice modal-notice" id="add-error" role="alert">{addError}</div>
      {/if}
      <form method="POST" action="?/create" use:enhance={submitAction('create', closeAdd)}>
        <div class="field-grid">
          <div class="field full">
            <AssetSearch
              inputId="add-asset-search"
              on:select={(event) => (selectedAddAsset = event.detail)}
            />
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
          {#if addPreview || sellWarning}
            <div class="field full entry-preview" class:warning={Boolean(sellWarning)}>
              {#if sellWarning}
                <TriangleAlert size={16} />
                <span>{sellWarning}</span>
              {:else if addPreview}
                <span>{addPreview.label}</span>
                <strong>
                  <PrivacyValue
                    value={formatCurrency(addPreview.value, addFiatCurrency)}
                    kind="fiat"
                  />
                </strong>
              {/if}
            </div>
          {/if}
          <div class="field full">
            <label class="field-label" for="notes">Notes</label>
            <textarea id="notes" name="notes"></textarea>
          </div>
        </div>
        <div class="modal-actions">
          <button class="btn" type="button" on:click={closeAdd}>Cancel</button>
          <button class="btn primary" type="submit" disabled={submittingIntent === 'create'}>
            {submittingIntent === 'create' ? 'Saving...' : 'Save'}
          </button>
        </div>
      </form>
    </div>
  </div>
{/if}

{#if editing}
  <div class="modal-backdrop" role="presentation">
    <div
      class="modal"
      role="dialog"
      tabindex="-1"
      aria-modal="true"
      aria-labelledby="edit-title"
      aria-describedby={editError ? 'edit-error' : undefined}
      on:keydown={(event) => handleDialogKeydown(event, closeEdit)}
    >
      <div class="modal-header">
        <h2 id="edit-title">Edit transaction</h2>
        <button
          class="btn icon"
          type="button"
          aria-label="Close edit transaction"
          on:click={closeEdit}><X size={17} /></button
        >
      </div>
      {#if editError}
        <div class="notice modal-notice" id="edit-error" role="alert">{editError}</div>
      {/if}
      <form method="POST" action="?/update" use:enhance={submitAction('update', closeEdit)}>
        <input type="hidden" name="id" value={editing.id} />
        <div class="field-grid">
          <div class="field full">
            <AssetSearch
              inputId="edit-asset-search"
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
          <button class="btn" type="button" on:click={closeEdit}>Cancel</button>
          <button class="btn primary" type="submit" disabled={submittingIntent === 'update'}>
            {submittingIntent === 'update' ? 'Updating...' : 'Update'}
          </button>
        </div>
      </form>
    </div>
  </div>
{/if}

{#if deleting}
  <div class="modal-backdrop" role="presentation">
    <div
      class="modal confirm"
      role="dialog"
      tabindex="-1"
      aria-modal="true"
      aria-labelledby="delete-title"
      aria-describedby="delete-description"
      on:keydown={(event) => handleDialogKeydown(event, closeDelete)}
    >
      <div class="modal-header">
        <h2 id="delete-title">Delete transaction</h2>
        <button
          class="btn icon"
          type="button"
          aria-label="Close delete confirmation"
          on:click={closeDelete}><X size={17} /></button
        >
      </div>
      <p class="muted" id="delete-description">
        Delete {deleting.assetSymbol}
        {deleting.type} from {formatDate(deleting.transactionDate)}?
      </p>
      {#if deleteError}
        <div class="notice modal-notice" role="alert">{deleteError}</div>
      {/if}
      <form method="POST" action="?/delete" use:enhance={submitAction('delete', closeDelete)}>
        <input type="hidden" name="id" value={deleting.id} />
        <div class="modal-actions">
          <button class="btn" type="button" on:click={closeDelete}>Cancel</button>
          <button
            class="btn danger"
            id="confirm-delete"
            type="submit"
            disabled={submittingIntent === 'delete'}
          >
            {submittingIntent === 'delete' ? 'Deleting...' : 'Delete'}
          </button>
        </div>
      </form>
    </div>
  </div>
{/if}

{#if showImport}
  <div class="modal-backdrop" role="presentation">
    <div
      class="modal confirm"
      role="dialog"
      tabindex="-1"
      aria-modal="true"
      aria-labelledby="import-title"
      aria-describedby={importError ? 'import-error' : undefined}
      on:keydown={(event) => handleDialogKeydown(event, closeImport)}
    >
      <div class="modal-header">
        <h2 id="import-title">Import CSV</h2>
        <button class="btn icon" type="button" aria-label="Close CSV import" on:click={closeImport}
          ><X size={17} /></button
        >
      </div>
      {#if importError}
        <div class="notice modal-notice" id="import-error" role="alert">{importError}</div>
      {/if}
      <form
        method="POST"
        action="?/previewCsv"
        enctype="multipart/form-data"
        use:enhance={submitAction('previewCsv')}
      >
        <div class="field">
          <label class="field-label" for="csv-file">CSV file</label>
          <input id="csv-file" name="csv_file" type="file" accept=".csv,text/csv" required />
        </div>
        <div class="modal-actions">
          <button class="btn" type="button" on:click={closeImport}>Cancel</button>
          <button class="btn primary" type="submit" disabled={submittingIntent === 'previewCsv'}>
            {submittingIntent === 'previewCsv' ? 'Checking...' : 'Preview'}
          </button>
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
                    <td><PrivacyValue value={row.quantity} kind="quantity" /></td>
                    <td>
                      <PrivacyValue
                        value={formatCurrency(row.fiatAmount, row.fiatCurrency)}
                        kind="fiat"
                      />
                    </td>
                    <td>{row.duplicate ? 'Duplicate' : 'Ready'}</td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
          <form
            method="POST"
            action="?/importCsv"
            use:enhance={submitAction('importCsv', closeImport)}
          >
            <input type="hidden" name="filename" value={form.filename ?? ''} />
            <textarea class="hidden-content" name="csv_content">{form.csvContent}</textarea>
            <div class="modal-actions">
              <button class="btn" type="button" on:click={closeImport}>Cancel</button>
              <button class="btn primary" type="submit" disabled={submittingIntent === 'importCsv'}>
                {submittingIntent === 'importCsv' ? 'Importing...' : 'Import ready rows'}
              </button>
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

  .secondary-actions {
    position: relative;
  }

  .secondary-actions summary {
    list-style: none;
  }

  .secondary-actions summary::-webkit-details-marker {
    display: none;
  }

  .action-menu {
    background: var(--surface);
    border: 1px solid var(--border-strong);
    border-radius: var(--radius-sm);
    box-shadow: var(--shadow);
    display: grid;
    min-width: 180px;
    padding: 0.4rem;
    position: absolute;
    right: 0;
    top: calc(100% + 0.45rem);
    z-index: 20;
  }

  .action-menu a,
  .action-menu button {
    align-items: center;
    background: transparent;
    border: 0;
    border-radius: 6px;
    color: var(--text);
    cursor: pointer;
    display: flex;
    gap: 0.65rem;
    min-height: 2.65rem;
    padding: 0 0.7rem;
    text-align: left;
  }

  .action-menu a:hover,
  .action-menu button:hover {
    background: var(--surface-soft);
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

  .modal-notice {
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
      grid-template-columns: auto minmax(0, 1fr);
      width: 100%;
    }

    .toolbar > .btn {
      width: 100%;
    }

    .action-menu {
      left: 0;
      right: auto;
    }
  }
</style>
