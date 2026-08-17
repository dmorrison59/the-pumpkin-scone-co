import Stripe from "stripe";

export const dynamic = "force-dynamic";

type OrderRow = {
  id: string;
  created: number;
  name: string;
  email: string;
  phone: string;
  packSize: number;
  boxes: number;
  scones: number;
  amount: number;
  paymentStatus: string;
};

function money(cents: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}

function dateTime(unix: number) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/New_York",
  }).format(new Date(unix * 1000));
}

export default async function AdminPage() {
  const secretKey = process.env.STRIPE_SECRET_KEY;

  if (!secretKey) {
    return (
      <main className="adminPage">
        <div className="adminShell">
          <h1>Admin is not configured.</h1>
          <p>Add STRIPE_SECRET_KEY in Vercel.</p>
        </div>
      </main>
    );
  }

  const stripe = new Stripe(secretKey);

  const sessions = await stripe.checkout.sessions.list({
    limit: 100,
  });

  const orders: OrderRow[] = sessions.data
    .filter(
      (session) =>
        session.payment_status === "paid" &&
        (session.metadata?.pack_size === "4" ||
          session.metadata?.pack_size === "8")
    )
    .map((session) => {
      const packSize = Number(session.metadata?.pack_size || 0);
      const boxes = Number(session.metadata?.box_quantity || 0);

      return {
        id: session.id,
        created: session.created,
        name:
          session.metadata?.customer_name ||
          session.customer_details?.name ||
          "Customer",
        email:
          session.customer_details?.email ||
          session.customer_email ||
          "",
        phone:
          session.metadata?.customer_phone ||
          session.customer_details?.phone ||
          "",
        packSize,
        boxes,
        scones:
          Number(session.metadata?.total_scones) ||
          packSize * boxes,
        amount: session.amount_total || 0,
        paymentStatus: session.payment_status,
      };
    });

  const totalRevenue = orders.reduce((sum, order) => sum + order.amount, 0);
  const totalScones = orders.reduce((sum, order) => sum + order.scones, 0);
  const fourPacks = orders
    .filter((order) => order.packSize === 4)
    .reduce((sum, order) => sum + order.boxes, 0);
  const eightPacks = orders
    .filter((order) => order.packSize === 8)
    .reduce((sum, order) => sum + order.boxes, 0);
  const batches = Math.ceil(totalScones / 8);

  return (
    <main className="adminPage">
      <div className="adminShell">
        <div className="adminHeader">
          <div>
            <p className="sectionKicker">The Pumpkin Scone Co.</p>
            <h1>Order Dashboard</h1>
            <p>
              Paid Stripe orders from the current sandbox/live Stripe account.
            </p>
          </div>
          <a className="primaryButton" href="/">
            View Website
          </a>
        </div>

        <section className="adminStats">
          <div>
            <span>Paid orders</span>
            <strong>{orders.length}</strong>
          </div>
          <div>
            <span>4-pack boxes</span>
            <strong>{fourPacks}</strong>
          </div>
          <div>
            <span>8-pack boxes</span>
            <strong>{eightPacks}</strong>
          </div>
          <div>
            <span>Total scones</span>
            <strong>{totalScones}</strong>
          </div>
          <div>
            <span>Recipe batches</span>
            <strong>{batches}</strong>
          </div>
          <div>
            <span>Revenue</span>
            <strong>{money(totalRevenue)}</strong>
          </div>
        </section>

        <section className="productionCard">
          <div>
            <p className="sectionKicker">Production</p>
            <h2>{totalScones} scones to bake</h2>
          </div>
          <div className="productionNumbers">
            <span>
              <b>{batches}</b>
              recipe batches
            </span>
            <span>
              <b>{fourPacks}</b>
              four-packs
            </span>
            <span>
              <b>{eightPacks}</b>
              eight-packs
            </span>
          </div>
        </section>

        <section className="ordersPanel">
          <div className="ordersHeading">
            <div>
              <p className="sectionKicker">Orders</p>
              <h2>Paid customers</h2>
            </div>
            <small>Newest first · Eastern Time</small>
          </div>

          {orders.length === 0 ? (
            <div className="emptyOrders">
              No paid scone orders yet. Sandbox test purchases will appear here.
            </div>
          ) : (
            <div className="ordersTableWrap">
              <table className="ordersTable">
                <thead>
                  <tr>
                    <th>Customer</th>
                    <th>Order</th>
                    <th>Scones</th>
                    <th>Paid</th>
                    <th>Ordered</th>
                    <th>Contact</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((order) => (
                    <tr key={order.id}>
                      <td>
                        <strong>{order.name}</strong>
                        <small>{order.email}</small>
                      </td>
                      <td>
                        {order.boxes} × {order.packSize}-pack
                      </td>
                      <td>{order.scones}</td>
                      <td>{money(order.amount)}</td>
                      <td>{dateTime(order.created)}</td>
                      <td>{order.phone || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
