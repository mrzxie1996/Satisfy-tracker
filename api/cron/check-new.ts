import { getRedis, kvEnvReady } from "../_lib/redis";

export default async function handler(req: any, res: any) {
  if (!kvEnvReady()) {
    return res.status(503).json({ ok: false, error: "KV_REST_API_URL / KV_REST_API_TOKEN not set" });
  }
  const redis = getRedis();

  // 1. 定义要监控的网站列表
  const sources = [
    { name: "Satisfy官网", url: "https://satisfyrunning.com/products.json?limit=50" },
    { name: "Slam Jam", url: "https://slamjam.com/en-hk/products.json?limit=50" },
  ];

  let newProductsMessage = "";

  // 2. 依次检查每个网站
  for (const source of sources) {
    try {
      const response = await fetch(source.url);
      const data = await response.json();
      const products = data.products || [];

      // 取最新的 5 个商品进行检查
      const latestProducts = products.slice(0, 5);

      for (const item of latestProducts) {
        const productId = item.id.toString();
        // 检查数据库里有没有这个商品
        const isKnown = await redis.get(`product_${productId}`);

        if (!isKnown) {
          // 如果数据库里没有，说明是新商品！
          newProductsMessage += `[${source.name}] 上新: ${item.title}\n`;
          // 存入数据库，下次就不会再报警了
          await redis.set(`product_${productId}`, "1");
        }
      }
    } catch (error) {
      console.log(`抓取 ${source.name} 失败:`, error);
    }
  }

  // 3. 如果发现了新商品，通过 PushPlus 发送微信通知
  if (newProductsMessage !== "") {
    const token = process.env.PUSHPLUS_TOKEN;
    if (token) {
      await fetch("https://www.pushplus.plus/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: token,
          title: "Satisfy 有新商品啦！",
          content: newProductsMessage,
        }),
      });
    } else {
      console.log("未找到 PUSHPLUS_TOKEN，无法发送微信通知");
    }
  }

  // 4. 返回执行结果给 Vercel
  res.status(200).json({
    message: "检查完成",
    foundNew: newProductsMessage !== "",
  });
}
