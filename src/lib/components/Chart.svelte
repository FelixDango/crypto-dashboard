<script lang="ts">
  import { onMount } from 'svelte';
  import type { EChartsOption } from 'echarts';
  import type { EChartsType } from 'echarts/core';

  export let option: EChartsOption;
  export let label = 'Chart';
  export let summary = '';

  let element: HTMLDivElement;
  let chart: EChartsType | null = null;

  onMount(() => {
    const resize = () => chart?.resize();
    let disposed = false;
    let observer: ResizeObserver | null = null;

    async function mountChart() {
      const [core, charts, components, renderers] = await Promise.all([
        import('echarts/core'),
        import('echarts/charts'),
        import('echarts/components'),
        import('echarts/renderers')
      ]);
      if (disposed) return;

      core.use([
        charts.LineChart,
        charts.PieChart,
        components.GridComponent,
        components.TooltipComponent,
        components.LegendComponent,
        renderers.CanvasRenderer
      ]);
      const mountedChart = core.init(element, 'dark', { renderer: 'canvas' });
      chart = mountedChart;
      mountedChart.setOption(option);
      window.addEventListener('resize', resize);
      if ('ResizeObserver' in window) {
        observer = new ResizeObserver(resize);
        observer.observe(element);
      }
    }

    void mountChart();

    return () => {
      disposed = true;
      window.removeEventListener('resize', resize);
      observer?.disconnect();
      chart?.dispose();
      chart = null;
    };
  });

  $: if (chart && option) {
    chart.setOption(option, true);
  }
</script>

<div class="chart" bind:this={element} aria-label={label}></div>
{#if summary}
  <p class="sr-only">{summary}</p>
{/if}

<style>
  .chart {
    min-height: 280px;
    width: 100%;
  }

  .sr-only {
    height: 1px;
    margin: -1px;
    overflow: hidden;
    position: absolute;
    white-space: nowrap;
    width: 1px;
  }

  @media (max-width: 680px) {
    .chart {
      min-height: 240px;
    }
  }
</style>
