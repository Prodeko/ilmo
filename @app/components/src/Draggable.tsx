import { DragEventHandler, useRef } from "react"
import { useDrag, useDrop, XYCoord } from "react-dnd"

interface DragItem {
  index: number
  id: string
  type: string
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

interface DraggableProps {
  id: string | number
  index: number
  move: (from: number, to: number) => void
  onDrop?: (item: DragItem) => void
}

export const Draggable: React.FC<DraggableProps> = (props) => {
  const { children } = props
  const { ref, isDragging } = useDraggable({ type: "list-draggable", ...props })
  return (
    <div
      ref={ref}
      style={{
        opacity: isDragging ? 0 : 1,
      }}
    >
      {children}
    </div>
  )
}

interface UseDraggableProps extends DraggableProps {
  type: string
}

export function useDraggable(props: UseDraggableProps) {
  const { type, id, index, move, onDrop } = props
  const ref = useRef<HTMLDivElement>(null)
  const [, drop] = useDrop({
    accept: type,
    drop: (item: DragItem, _monitor) => {
      if (onDrop && typeof onDrop === "function") {
        onDrop(item)
      }
      return item
    },
    hover(item: DragItem, monitor) {
      if (!ref.current) {
        return
      }
      const dragIndex = item.index
      const hoverIndex = index

      // Don't replace items with themselves
      if (dragIndex === hoverIndex) {
        return
      }

      // Determine rectangle on screen
      const hoverBoundingRect = ref.current?.getBoundingClientRect()

      // Get vertical middle
      const hoverMiddleY =
        (hoverBoundingRect.bottom - hoverBoundingRect.top) / 2

      // Determine mouse position
      const clientOffset = monitor.getClientOffset()

      // Get pixels to the top
      const hoverClientY = (clientOffset as XYCoord).y - hoverBoundingRect.top

      // Only perform the move when the mouse has crossed half of the items height
      // When dragging downwards, only move when the cursor is below 50%
      // When dragging upwards, only move when the cursor is above 50%

      // Dragging downwards
      if (dragIndex < hoverIndex && hoverClientY < hoverMiddleY) {
        return
      }

      // Dragging upwards
      if (dragIndex > hoverIndex && hoverClientY > hoverMiddleY) {
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
