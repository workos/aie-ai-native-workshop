import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import GlossaryClient from './GlossaryClient'
import glossary from './glossary.json'
import './styles.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <GlossaryClient glossary={glossary} />
  </StrictMode>,
)
