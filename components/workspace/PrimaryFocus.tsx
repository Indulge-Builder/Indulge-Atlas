"use client";

import { useState, useTransition, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  getTodos,
  addTodo,
  toggleTodo,
  deleteTodo,
  type PersonalTodo,
} from "@/lib/actions/todos";

// ── Custom circular checkbox with Framer Motion ────────────

function TodoCheckbox({
  isCompleted,
  onToggle,
}: {
  isCompleted: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      onClick={onToggle}
      className={`flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center focus:outline-none focus:ring-2 focus:ring-stone-300 focus:ring-offset-2 transition-colors ${
        isCompleted
          ? "bg-emerald-500 ring-1 ring-emerald-500"
          : "ring-1 ring-stone-300 bg-transparent"
      }`}
      aria-label={isCompleted ? "Mark incomplete" : "Mark complete"}
    >
      <AnimatePresence>
        {isCompleted && (
          <motion.svg
            viewBox="0 0 20 20"
            fill="none"
            className="w-3 h-3 text-white"
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: "backOut" }}
          >
            <path
              d="M4 10 L8 14 L16 6"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </motion.svg>
        )}
      </AnimatePresence>
    </button>
  );
}

// ── Single to-do item row ───────────────────────────────────

function TodoItem({
  todo,
  onToggle,
  onDelete,
}: {
  todo: PersonalTodo;
  onToggle: () => void;
  onDelete: () => void;
}) {
  const handleDelete = useCallback(() => {
    onDelete();
  }, [onDelete]);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -16 }}
      transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
      className="group flex items-center gap-3 py-2"
    >
      <TodoCheckbox isCompleted={todo.is_completed} onToggle={onToggle} />

      <span
        className={`flex-1 text-[15px] leading-relaxed transition-colors ${
          todo.is_completed ? "line-through text-stone-400" : "text-stone-700"
        }`}
      >
        {todo.content}
      </span>

      <motion.button
        onClick={handleDelete}
        className="flex-shrink-0 p-1 rounded-full text-stone-300 hover:text-stone-600 hover:bg-stone-100 opacity-0 group-hover:opacity-100 focus:opacity-100 focus:outline-none transition-all duration-200"
        aria-label="Delete"
      >
        <Trash2 className="w-3.5 h-3.5" />
      </motion.button>
    </motion.div>
  );
}

// ── Main component ──────────────────────────────────────────

interface PrimaryFocusProps {
  initialTodos: PersonalTodo[];
  currentUserId: string;
}

export function PrimaryFocus({ initialTodos, currentUserId }: PrimaryFocusProps) {
  const [todos, setTodos] = useState<PersonalTodo[]>(initialTodos);
  const [showInput, setShowInput] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const [, startTransition] = useTransition();

  const handleAddTodo = useCallback(() => {
    const trimmed = inputValue.trim();
    if (!trimmed) {
      setShowInput(false);
      setInputValue("");
      return;
    }

    // Optimistic add
    const tempId = `temp-${Date.now()}`;
    const optimistic: PersonalTodo = {
      id: tempId,
      user_id: currentUserId,
      content: trimmed,
      is_completed: false,
      created_at: new Date().toISOString(),
    };
    setTodos((prev) => [...prev, optimistic]);
    setInputValue("");
    setShowInput(false);

    startTransition(async () => {
      const { data: added, error } = await addTodo(trimmed);
      if (added) {
        setTodos((prev) =>
          prev.map((t) => (t.id === tempId ? added : t))
        );
      } else {
        setTodos((prev) => prev.filter((t) => t.id !== tempId));
        toast.error(error ?? "Could not save");
      }
    });
  }, [inputValue, currentUserId]);

  const handleToggle = useCallback((id: string, is_completed: boolean) => {
    setTodos((prev) =>
      prev.map((t) => (t.id === id ? { ...t, is_completed } : t))
    );
    startTransition(async () => {
      const ok = await toggleTodo(id, is_completed);
      if (!ok) {
        setTodos((prev) =>
          prev.map((t) => (t.id === id ? { ...t, is_completed: !is_completed } : t))
        );
      }
    });
  }, []);

  const handleDelete = useCallback((id: string) => {
    setTodos((prev) => prev.filter((t) => t.id !== id));
    startTransition(async () => {
      await deleteTodo(id);
    });
  }, []);

  return (
    <div
      className="rounded-2xl bg-white/80 backdrop-blur-2xl ring-1 ring-black/[0.03] shadow-[0_8px_30px_rgb(0,0,0,0.02)] overflow-hidden"
      style={{ minHeight: 200 }}
    >
      <div className="px-6 py-5">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-stone-900 font-medium text-[15px] tracking-tight">
            Primary Focus
          </h3>
          <button
            onClick={() => {
              setShowInput(true);
              setTimeout(() => document.getElementById("primary-focus-input")?.focus(), 50);
            }}
            className="text-stone-400 hover:text-stone-900 hover:bg-stone-100 rounded-full p-1 transition-colors"
            aria-label="Add to-do"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>

        {/* List */}
        <div className="space-y-0">
          <AnimatePresence>
            {todos.map((todo) => (
              <TodoItem
                key={todo.id}
                todo={todo}
                onToggle={() =>
                  handleToggle(todo.id, !todo.is_completed)
                }
                onDelete={() => handleDelete(todo.id)}
              />
            ))}
          </AnimatePresence>

          {/* Inline add input */}
          <AnimatePresence>
            {showInput && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                className="overflow-hidden"
              >
                <div className="flex items-center gap-3 py-2">
                  <div className="flex-shrink-0 w-5 h-5 rounded-full ring-1 ring-stone-300 bg-transparent" />
                  <input
                    id="primary-focus-input"
                    type="text"
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleAddTodo();
                      if (e.key === "Escape") {
                        setShowInput(false);
                        setInputValue("");
                      }
                    }}
                    onBlur={() => {
                      if (!inputValue.trim()) setShowInput(false);
                    }}
                    placeholder="Add a focus..."
                    className="flex-1 border-none bg-transparent focus:ring-0 placeholder-stone-400 text-stone-700 text-[15px] outline-none"
                    autoComplete="off"
                  />
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {todos.length === 0 && !showInput && (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-stone-400 text-[14px] italic py-4"
          >
            Click + to add your first focus.
          </motion.p>
        )}
      </div>
    </div>
  );
}
