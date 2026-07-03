<script lang="ts">
  import { enhance } from '$app/forms';
  import type { SubmitFunction } from '@sveltejs/kit';
  import { Download, Pencil, Plus, Search, Trash2, Upload, X } from '@lucide/svelte';
  import AssetSearch from '$lib/components/AssetSearch.svelte';
  import CryptoIcon from '$lib/components/CryptoIcon.svelte';
  import { formatCurrency, formatCrypto, formatDate } from '$lib/format';
  import type { TransactionRecord } from '$lib/types';

  export let data: {
    transactions: TransactionRecord[];
    settings: { baseCurrency: 'EUR' | 'USD' };
  };
  export let form: { error?: string; imported?: number } | null;

  let query = '';
  let typeFilter = 'all';
  let showAdd = false;
  let showImport = false;
  let editing: TransactionRecord | null = null;
  let deleting: TransactionRecord | null = null;

  $: filtered = data.transactions.filter((transaction) => {
    const text =
      `${transaction.assetSymbol} ${transaction.assetName} ${transaction.notes ?? ''}`.toLowerCase();
    const matchesQuery = text.includes(query.toLowerCase());
    const matchesType = typeFilter === 'all' || transaction.type === typeFilter;
    return matchesQuery && matchesType;
  });

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
</script>

<section class="page">
  <div class="page-header">
    <div class="page-title">
      <h1>Transactions qweqwdwqd</h1>
      <p class="muted">{data.transactions.length} manual entries</p>
    </div>
    <div class="toolbar">
      <a class="btn" href="/api/export">
        <Download size={17} />
        CSV
      </a>
      <button class="btn" type="button" on:click={() => (showImport = true)}>
        <Upload size={17} />
        Import
      </button>
      <button class="btn primary" type="button" on:click={() => (showAdd = true)}>
        <Plus size={17} />
        Add
      </button>
    </div>
  </div>

  {#if form?.error}
    <div class="notice">{form.error}</div>
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
            <AssetSearch />
          </div>
          <div class="field">
            <label class="field-label" for="type">Type</label>
            <select id="type" name="type">
              <option value="buy">Buy</option>
              <option value="sell">Sell</option>
            </select>
          </div>
          <div class="field">
            <label class="field-label" for="date">Date</label>
            <input id="date" name="transaction_date" type="date" value={defaultDate()} required />
          </div>
          <div class="field">
            <label class="field-label" for="quantity">Quantity</label>
            <input id="quantity" name="quantity" inputmode="decimal" required />
          </div>
          <div class="field">
            <label class="field-label" for="fiat">Fiat amount</label>
            <input id="fiat" name="fiat_amount" inputmode="decimal" required />
          </div>
          <div class="field">
            <label class="field-label" for="currency">Fiat currency</label>
            <select id="currency" name="fiat_currency">
              <option value="EUR" selected={data.settings.baseCurrency === 'EUR'}>EUR</option>
              <option value="USD" selected={data.settings.baseCurrency === 'USD'}>USD</option>
            </select>
          </div>
          <div class="field">
            <label class="field-label" for="fee">Fee</label>
            <input id="fee" name="fee_amount" inputmode="decimal" />
          </div>
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
      <form
        method="POST"
        action="?/importCsv"
        enctype="multipart/form-data"
        use:enhance={closeOnSuccess(() => (showImport = false))}
      >
        <div class="field">
          <label class="field-label" for="csv-file">CSV file</label>
          <input id="csv-file" name="csv_file" type="file" accept=".csv,text/csv" required />
        </div>
        <div class="modal-actions">
          <button class="btn" type="button" on:click={() => (showImport = false)}>Cancel</button>
          <button class="btn primary" type="submit">Import</button>
        </div>
      </form>
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
