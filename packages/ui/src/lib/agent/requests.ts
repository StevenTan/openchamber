import type { JsonValue, Metadata } from "./model"

export type FormWhen = {
    key: string;
    op: "eq" | "neq";
    value: string | number | "Infinity" | "-Infinity" | "NaN" | boolean;
};

type FormOption = {
    value: string;
    label: string;
    description?: string;
};

type FormExternalField = {
    key: string;
    type: "external";
    url: string;
    title?: string;
    description?: string;
};

type FormNumberField = {
    key: string;
    title?: string;
    description?: string;
    required?: boolean;
    hidden?: boolean;
    when?: Array<FormWhen>;
    type: "number";
    minimum?: number | "Infinity" | "-Infinity" | "NaN";
    maximum?: number | "Infinity" | "-Infinity" | "NaN";
    default?: number | "Infinity" | "-Infinity" | "NaN";
};

type FormIntegerField = {
    key: string;
    title?: string;
    description?: string;
    required?: boolean;
    hidden?: boolean;
    when?: Array<FormWhen>;
    type: "integer";
    minimum?: number | "Infinity" | "-Infinity" | "NaN";
    maximum?: number | "Infinity" | "-Infinity" | "NaN";
    default?: number | "Infinity" | "-Infinity" | "NaN";
};

type FormBooleanField = {
    key: string;
    title?: string;
    description?: string;
    required?: boolean;
    hidden?: boolean;
    when?: Array<FormWhen>;
    type: "boolean";
    default?: boolean;
};

type FormStringField = {
    key: string;
    title?: string;
    description?: string;
    required?: boolean;
    hidden?: boolean;
    when?: Array<FormWhen>;
    type: "string";
    format?: "email" | "uri" | "date" | "date-time";
    minLength?: number;
    maxLength?: number;
    pattern?: string;
    placeholder?: string;
    default?: string;
    options?: Array<FormOption>;
    custom?: boolean;
};

type FormMultiselectField = {
    key: string;
    title?: string;
    description?: string;
    required?: boolean;
    hidden?: boolean;
    when?: Array<FormWhen>;
    type: "multiselect";
    options: Array<FormOption>;
    minItems?: number;
    maxItems?: number;
    custom?: boolean;
    default?: Array<string>;
};

export type FormValue = string | number | "Infinity" | "-Infinity" | "NaN" | boolean | Array<string>;

export type FormField = FormStringField | FormNumberField | FormIntegerField | FormBooleanField | FormMultiselectField | FormExternalField;

export type FormRequest = {
    id: string;
    sessionID: string;
    title: string;
    metadata?: Metadata;
    fields: [FormField, ...FormField[]];
};

export type PermissionRequest = {
    id: string;
    sessionID: string;
    action: string;
    resources: Array<string>;
    save?: Array<string>;
    metadata?: {
        [x: string]: JsonValue;
    };
    source?: PermissionSource;
    message?: string;
};

export type PermissionSource = {
    type: "tool";
    messageID: string;
    id: string;
};

export type PermissionEffect = 'allow' | 'deny' | 'ask';
