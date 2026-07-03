import { getPortfolioOverview } from '$lib/server/portfolio/service';

export async function load() {
  return {
    overview: await getPortfolioOverview()
  };
}
