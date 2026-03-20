import { Hono } from "hono";

const billing = new Hono();

billing.get("/balance", async (c) => {
    return c.json(
        {
            error: {
                message: "Billing service has not been implemented yet",
            },
        },
        501
    );
});

billing.post("/checkout", async (c) => {
    return c.json(
        {
            error: {
                message: "Billing service has not been implemented yet",
            },
        },
        501
    );
});

billing.post("/webhook", async (c) => {
    return c.json(
        {
            error: {
                message: "Billing service has bot been implemented yet",
            },
        },
        501
    );
});

export default billing;
