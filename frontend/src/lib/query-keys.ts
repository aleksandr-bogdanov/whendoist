import { getListTasksApiV1TasksGetQueryKey } from "@/api/queries/tasks/tasks";

/** Dashboard fetches all non-archived tasks (pending + completed). */
export const DASHBOARD_TASKS_PARAMS = { status: "all" } as const;
export const dashboardTasksKey = () => getListTasksApiV1TasksGetQueryKey(DASHBOARD_TASKS_PARAMS);
