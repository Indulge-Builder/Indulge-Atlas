-- Full row images for UPDATE/DELETE on Realtime so clients can adjust overdue counts
-- without a database round-trip (see TaskAlertProvider applyTaskPayloadToOverdueCount).
ALTER TABLE public.tasks REPLICA IDENTITY FULL;
