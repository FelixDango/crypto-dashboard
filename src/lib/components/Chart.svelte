<script lang="ts">
  import { onMount } from 'svelte';
  import type { EChartsOption } from 'echarts';
  import type { EChartsType } from 'echarts/core';

  export let option: EChartsOption;
  export let label = 'Chart';

  let element: HTMLDivElement;
  let chart: EChartsType | null = null;

  onMount(() => {
    const resize = () => chart?.resize();
    let disposed = false;

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
    }

    void mountChart();

    return () => {
      disposed = true;
      window.removeEventListener('resize', resize);
      chart?.dispose();
      chart = null;
    };
  });

  $: if (chart && option) {
    chart.setOption(option, true);
  }
</script>

<div class="chart" bind:this={element} aria-label={label}></div>

<style>
  .chart {
    min-height: 280px;
    width: 100%;
  }
</style>
