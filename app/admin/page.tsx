import Stripe from "stripe";

export const dynamic = "force-dynamic";

type FulfillmentStatus = "paid" | "ready" | "picked_up";

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
  fulfillmentStatus: FulfillmentStatus;
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

function formatPhone(value: string) {
  const digits = value.replace(/\D/g, "");
  const normalized = digits.length === 11 && digits.startsWith("1")
    ? digits.slice(1)
    : digits;

  if (normalized.length !== 10) return value || "—";

  return `(${normalized.slice(0, 3)}) ${normalized.slice(3, 6)}-${normalized.slice(6)}`;
}

function normalizeStatus(value?: string | null): FulfillmentStatus {
  if (value === "ready" || value === "picked_up") return value;
  return "paid";
}

function statusLabel(status: FulfillmentStatus) {
  if (status === "ready") return "Ready";
  if (status === "picked_up") return "Picked Up";
  return "Paid";
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
  const isTestMode = secretKey.startsWith("sk_test_");

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
        fulfillmentStatus: normalizeStatus(
          session.metadata?.fulfillment_status
        ),
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

  const paidCount = orders.filter(
    (order) => order.fulfillmentStatus === "paid"
  ).length;
  const readyCount = orders.filter(
    (order) => order.fulfillmentStatus === "ready"
  ).length;
  const pickedUpCount = orders.filter(
    (order) => order.fulfillmentStatus === "picked_up"
  ).length;

  return (
    <main className="adminPage">
      <div className="adminShell">
        <div className="adminHeader">
          <div>
            <div className="adminTitleLine">
              <p className="sectionKicker">The Pumpkin Scone Co.</p>
              <span className={isTestMode ? "modeBadge test" : "modeBadge live"}>
                {isTestMode ? "Stripe Sandbox" : "LIVE PAYMENTS"}
              </span>
            </div>
            <h1>Order Dashboard</h1>
            <p>
              Paid Stripe orders and pickup status for your scone orders.
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

        <section className="workflowStats">
          <div>
            <span className="statusDot paid" />
            <b>{paidCount}</b>
            <small>Paid / to prepare</small>
          </div>
          <div>
            <span className="statusDot ready" />
            <b>{readyCount}</b>
            <small>Ready for pickup</small>
          </div>
          <div>
            <span className="statusDot picked" />
            <b>{pickedUpCount}</b>
            <small>Picked up</small>
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
                    <th>Status</th>
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
                      <td>{formatPhone(order.phone)}</td>
                      <td>
                        <div className="statusCell">
                          <span className={`statusPill ${order.fulfillmentStatus}`}>
                            {statusLabel(order.fulfillmentStatus)}
                          </span>

                          <div className="statusActions">
                            {order.fulfillmentStatus !== "paid" && (
                              <form action="/api/admin/order-status" method="post">
                                <input type="hidden" name="session_id" value={order.id} />
                                <input type="hidden" name="status" value="paid" />
                                <button type="submit">Paid</button>
                              </form>
                            )}

                            {order.fulfillmentStatus !== "ready" && (
                              <form action="/api/admin/order-status" method="post">
                                <input type="hidden" name="session_id" value={order.id} />
                                <input type="hidden" name="status" value="ready" />
                                <button type="submit">Ready</button>
                              </form>
                            )}

                            {order.fulfillmentStatus !== "picked_up" && (
                              <form action="/api/admin/order-status" method="post">
                                <input type="hidden" name="session_id" value={order.id} />
                                <input type="hidden" name="status" value="picked_up" />
                                <button type="submit">Picked Up</button>
                              </form>
                            )}
                          </div>
                        </div>
                      </td>
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
