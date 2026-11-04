import { expect, test } from "@playwright/test";
test("cluster check", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/");
  await page.locator("[data-project-map] .leaflet-interactive").first().waitFor();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: "/tmp/cluster-0.png" });
  const zoomOut = page.getByRole("button", { name: "Zoom ut" });
  for (let i = 0; i < 3; i++) { await zoomOut.click(); await page.waitForTimeout(600); }
  await page.screenshot({ path: "/tmp/cluster-1.png" });
  for (let i = 0; i < 3; i++) { await zoomOut.click(); await page.waitForTimeout(600); }
  await page.screenshot({ path: "/tmp/cluster-2.png" });
  const cluster = page.locator(".project-cluster").first();
  console.log("clusters", await page.locator(".project-cluster").count(), await cluster.getAttribute("aria-label"));
  await cluster.click();
  await page.waitForTimeout(1000);
  await page.screenshot({ path: "/tmp/cluster-3.png" });
  await expect(page.locator("[data-project-map]")).toBeVisible();
});
