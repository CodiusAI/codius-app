import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { expect, type Page } from "@playwright/test";
import { test } from "./fixtures";
import type { ArchiveTabAgent } from "./helpers/archive-tab";
import { openCommandCenter } from "./helpers/command-center";
import { seedWorkspace, type SeededWorkspace } from "./helpers/seed-client";
import { getServerId } from "./helpers/server-id";
import { buildHostAgentDetailRoute } from "@/utils/host-routes";

const ASSET_DIRECTORY = process.env.CODIUS_MARKETING_ASSET_DIR;

async function openMarketingWorkspaceWithAgents(
  page: Page,
  agents: [ArchiveTabAgent, ArchiveTabAgent],
) {
  for (const agent of agents) {
    await page.goto(buildHostAgentDetailRoute(getServerId(), agent.id, agent.workspaceId));
    await page.waitForURL(
      (url) => url.pathname.includes("/workspace/") && !url.searchParams.has("open"),
      { timeout: 60_000 },
    );
    await expect(
      page.getByTestId(`workspace-tab-agent_${agent.id}`).filter({ visible: true }).first(),
    ).toBeVisible({ timeout: 30_000 });
  }
}

async function createSanitizedDemoAgent(
  workspace: SeededWorkspace,
  title: string,
  initialPrompt?: string,
) {
  const created = await workspace.client.createAgent({
    provider: "mock",
    model: "ten-second-stream",
    modeId: "load-test",
    cwd: workspace.repoPath,
    workspaceId: workspace.workspaceId,
    title,
    initialPrompt,
  });
  if (initialPrompt) {
    await workspace.client.waitForFinish(created.id, 30_000);
  } else {
    await workspace.client.waitForAgentUpsert(
      created.id,
      (agent) => agent.status === "idle",
      30_000,
    );
  }
  return {
    id: created.id,
    title,
    cwd: workspace.repoPath,
    workspaceId: workspace.workspaceId,
  };
}

test.describe("Codius product marketing captures", () => {
  test.skip(!ASSET_DIRECTORY, "Set CODIUS_MARKETING_ASSET_DIR to write reviewed product captures.");
  test.describe.configure({ timeout: 180_000 });

  test("captures the real App in light and dark mode with sanitized demo data", async ({
    page,
  }) => {
    if (!ASSET_DIRECTORY) return;
    const outputDirectory = resolve(ASSET_DIRECTORY);
    mkdirSync(outputDirectory, { recursive: true });

    for (const colorScheme of ["light", "dark"] as const) {
      await page.emulateMedia({ colorScheme });
      const suffix = colorScheme === "dark" ? "-dark" : "";
      const workspace = await seedWorkspace({
        repoPrefix: "storefront-demo-",
        title: "Storefront reliability",
        repo: {
          files: [
            {
              path: "src/checkout.ts",
              content: "export const checkout = () => ({ ok: true });\n",
            },
            {
              path: "src/pricing.ts",
              content:
                "export const subtotal = (items: number[]) => items.reduce((a, b) => a + b, 0);\n",
            },
            {
              path: "tests/checkout.test.ts",
              content: "describe('checkout', () => { it('completes', () => {}); });\n",
            },
          ],
        },
      });

      try {
        const reviewAgent = await createSanitizedDemoAgent(
          workspace,
          "Review checkout retries",
          "Review the checkout retry logic and summarize any reliability risks.",
        );
        const pricingAgent = await createSanitizedDemoAgent(workspace, "Update pricing tests");

        await page.setViewportSize({ width: 1440, height: 900 });
        await openMarketingWorkspaceWithAgents(page, [pricingAgent, reviewAgent]);
        await expect(page.getByText("Storefront reliability", { exact: true }).first()).toBeVisible(
          {
            timeout: 30_000,
          },
        );
        await page.screenshot({
          path: resolve(outputDirectory, `codius-app-desktop${suffix}.png`),
          clip: { x: 0, y: 0, width: 1440, height: 610 },
        });

        await page.getByTestId("sidebar-home").click();
        const commandCenter = await openCommandCenter(page);
        await expect(
          commandCenter.getByText("Storefront reliability", { exact: true }),
        ).toBeVisible({
          timeout: 30_000,
        });
        // The command center uses a short entrance transition. Marketing captures
        // must be taken from the settled product state, never an in-between frame.
        await expect(commandCenter).toHaveCSS("opacity", "1");
        await page.waitForTimeout(450);
        await page.screenshot({
          path: resolve(outputDirectory, `codius-app-command-center${suffix}.png`),
          clip: { x: 0, y: 0, width: 1440, height: 700 },
        });

        await page.keyboard.press("Escape");
        await expect(commandCenter).toBeHidden({ timeout: 30_000 });
        await page.setViewportSize({ width: 390, height: 844 });
        // The compact layout intentionally replaces desktop workspace tabs with
        // mobile navigation. Open the agent detail route directly and assert the
        // real agent content instead of depending on a desktop-only test id.
        await page.goto(
          buildHostAgentDetailRoute(getServerId(), reviewAgent.id, reviewAgent.workspaceId),
        );
        await page.waitForURL(
          (url) => url.pathname.includes("/workspace/") && !url.searchParams.has("open"),
          { timeout: 60_000 },
        );
        await expect(
          page
            .getByText("Review checkout retries", { exact: true })
            .filter({ visible: true })
            .first(),
        ).toBeVisible({ timeout: 30_000 });
        await page.waitForTimeout(300);
        await page.screenshot({
          path: resolve(outputDirectory, `codius-app-mobile${suffix}.png`),
          fullPage: false,
        });
      } finally {
        await workspace.cleanup();
      }
    }
  });
});
