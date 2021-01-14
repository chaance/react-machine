export const ASSIGN = "assign";
export const REDUCE = "reduce";
export const ACTION = "action";
export const GUARD = "guard";
export const INVOKE = "invoke";
export const EFFECT = "effect";
export const HOOKS = {
	ASSIGN,
	REDUCE,
	ACTION,
	GUARD,
	INVOKE,
	EFFECT,
} as const;

export const HOOK_KEYS = {
	guard: "guards" as const,
	reduce: "reducers" as const,
	effect: "effects" as const,
	invoke: "invokes" as const,
};
