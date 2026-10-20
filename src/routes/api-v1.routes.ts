import { Router } from "express";
import { authRouter } from "../modules/auth/auth.routes";
import { examplesRouter } from "../modules/examples/examples.routes";
import { teamsRouter } from "../modules/teams/teams.routes";
import { ticketsRouter } from "../modules/tickets/tickets.routes";
import { notificationsRouter } from "../modules/notifications/notifications.routes";
import { analyticsRouter } from "../modules/analytics/analytics.routes";
import { authenticate } from "../shared/middleware/authenticate.middleware";
import { orgRateLimiter } from "../shared/middleware/rate-limit.middleware";
import { idempotencyMiddleware } from "../shared/middleware/idempotency.middleware";

const apiV1Router = Router();

// Public auth routes apply their own IP-based rate limit.
apiV1Router.use("/auth", authRouter);

// All other routes run authenticate first, then rate-limit and idempotency
apiV1Router.use(authenticate);
apiV1Router.use(orgRateLimiter);
apiV1Router.use(idempotencyMiddleware);

apiV1Router.use("/teams", teamsRouter);
apiV1Router.use("/tickets", ticketsRouter);
apiV1Router.use("/notifications", notificationsRouter);
apiV1Router.use("/analytics", analyticsRouter);
apiV1Router.use("/examples", examplesRouter);

export { apiV1Router };
