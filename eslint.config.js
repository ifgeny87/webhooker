import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
	eslint.configs.recommended,
	...tseslint.configs.recommended,
	{
		rules: {
			"@typescript-eslint/no-explicit-any": "warn",
			"@typescript-eslint/explicit-function-return-type": "off",
			quotes: ["error", "single", { avoidEscape: true }],
			"max-len": ["warn", { code: 80, ignoreUrls: true, ignoreStrings: true }],
		},
	},
	{
		files: ["tests/**/*.ts"],
		rules: {
			"@typescript-eslint/no-unused-expressions": "off",
		},
	},
);
