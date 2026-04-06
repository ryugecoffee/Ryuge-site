export default async function handler(req, res) {
  const response = await fetch(
    "https://connect.squareup.com/v2/catalog/list?types=ITEM",
    {
      headers: {
        Authorization: `Bearer ${process.env.SQUARE_ACCESS_TOKEN}`,
        "Square-Version": "2024-01-18",
        "Content-Type": "application/json",
      },
    }
  );

  if (!response.ok) {
    return res.status(500).json({ error: "Failed to fetch from Square" });
  }

  const data = await response.json();

  const products = (data.objects ?? []).map((obj) => ({
    id: obj.id,
    title: obj.item_data.name,
    shortDescription: obj.item_data.description ?? "",
    description: obj.item_data.description ?? "",
    image: null,
  }));

  res.status(200).json(products);
}