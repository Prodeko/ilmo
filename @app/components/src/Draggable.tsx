import React, { DragEventHandler, useRef } from "react"
import { useDrag, useDrop } from "react-dnd"

type DragWithIndex = {
  index: number
}

interface DraggableProps {
  id: string | number
  index: number
  move: (from: number, to: number) => void
}

interface DisableDraggableProps {
  onDragStart: DragEventHandler<HTMLInputElement>
  draggable: boolean
}

export const DisableDraggable: DisableDraggableProps = {
  onDragStart(event) {
    event.stopPropagation()
    event.preventDefault()
  },
  draggable: true,
}

export const Draggable: React.FC<DraggableProps> = ({
  id,
  index,
  move,
  children,
}) => {
  const { ref, isDragging } = useDraggable("list-draggable", id, index, move)
  return (
    <div
      ref={ref}
      style={{
        opacity: isDragging ? 0.5 : 1,
      }}
    >
      {children}
    </div>
  )
}

export function useDraggable(
  type: string,
  id: string | number,
  index: number,
  move: (from: number, to: number) => void
) {
  const ref = useRef<HTMLDivElement>(null)
  const [, drop] = useDrop({
    accept: type,
    hover(item: DragWithIndex, monitor) {
      if (!ref.current) {
        return
      }
      const dragIndex = item.index
      if (dragIndex === undefined || dragIndex === null) return
      const hoverIndex = index

      // Don't replace items with themselves
      if (dragIndex === hoverIndex) {
        return
      }

      // Determine rectangle on screen
      const hoverBoundingRect = ref.current.getBoundingClientRect()

      // Get vertical middle
      const hoverMiddleY =
        (hoverBoundingRect.bottom - hoverBoundingRect.top) / 2
      const hoverMiddleX =
        (hoverBoundingRect.right - hoverBoundingRect.left) / 2

      // Determine mouse position
      const clientOffset = monitor.getClientOffset()!

      // Get pixels to the top
      const hoverClientY = clientOffset.y - hoverBoundingRect.top
      const hoverClientX = clientOffset.x - hoverBoundingRect.left

      // Only perform the move when the mouse has crossed half of the items height
      // When dragging downwards, only move when the cursor is below 50%
      // When dragging upwards, only move when the cursor is above 50%

      // Dragging downwards
      if (
        dragIndex < hoverIndex &&
        hoverClientY < hoverMiddleY &&
        hoverClientX < hoverMiddleX
      ) {
        return
      }

      // Dragging upwards
      if (
        dragIndex > hoverIndex &&
        hoverClientY > hoverMiddleY &&
        hoverClientX > hoverMiddleX
      ) {
        return
      }

      // Time to actually perform the action
      move(dragIndex, hoverIndex)

      // Note: we're mutating the monitor item here!
      // Generally it's better to avoid mutations,
      // but it's good here for the sake of performance
      // to avoid expensive index searches.
      item.index = hoverIndex
    },
  })
  const [{ isDragging }, drag] = useDrag({
    type: "list-draggable",
    item: { type, id, index },
    collect: (monitor) => ({
      isDragging: monitor.isDragging(),
    }),
  })
  drag(drop(ref))
  return {
    ref,
    isDragging,
  }
}
