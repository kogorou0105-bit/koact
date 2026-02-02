import { useState, useEffect, useMemo, useCallback, useRef } from "./hooks";
import { render } from "./scheduler";
import { __SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED } from "@koact/react";
import { initDevTools } from "./devTools";

initDevTools();
const HooksDispatcher = {
  useState,
  useEffect,
  useMemo,
  useCallback,
  useRef,
};
__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED.SharedInternals.currentDispatcher =
  HooksDispatcher;

const ReactDOM = {
  render,
};

export default ReactDOM;
