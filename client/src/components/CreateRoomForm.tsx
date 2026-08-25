import React, { useState } from 'react'
import styled from 'styled-components'
import Alert from '@mui/material/Alert'
import Button from '@mui/material/Button'
import IconButton from '@mui/material/IconButton'
import TextField from '@mui/material/TextField'
import InputAdornment from '@mui/material/InputAdornment'
import FormControlLabel from '@mui/material/FormControlLabel'
import Checkbox from '@mui/material/Checkbox'
import TextFieldMui from '@mui/material/TextField'
import MenuItem from '@mui/material/MenuItem'
import Visibility from '@mui/icons-material/Visibility'
import VisibilityOff from '@mui/icons-material/VisibilityOff'

import { IRoomData, OFFICE_LAYOUTS, OFFICE_LIFETIMES, OfficeLayout } from '../../../types/Rooms'
import {
  DEFAULT_OFFICE_SPEC,
  OFFICE_SPEC_FIELDS,
  OfficeSpec,
  totalDesks,
  totalRooms,
} from '../../../types/Office'
import { joinErrorMessage } from '../joinErrors'
import { newOfficeSlug } from '../shareLink'
import { useAppSelector } from '../hooks'

import phaserGame from '../PhaserGame'
import Bootstrap from '../scenes/Bootstrap'

const CreateRoomFormWrapper = styled.form`
  display: flex;
  flex-direction: column;
  width: 320px;
  gap: 20px;
`

const OfficeSpecFields = styled.div`
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 14px;
  border: 1px solid rgba(255, 255, 255, 0.16);
  border-radius: 6px;
`

const SpecHeading = styled.div`
  font-size: 14px;
  font-weight: 600;

  span {
    display: block;
    margin-top: 4px;
    font-size: 12px;
    font-weight: 400;
    opacity: 0.7;
  }
`

export const CreateRoomForm = () => {
  const [values, setValues] = useState<IRoomData>({
    name: '',
    description: '',
    password: null,
    unlisted: false,
  })
  // 0 means the office closes when everyone leaves and its link dies with it
  const [lifetimeDays, setLifetimeDays] = useState(0)
  const [layout, setLayout] = useState<OfficeLayout>('classic')
  const [office, setOffice] = useState<OfficeSpec>(DEFAULT_OFFICE_SPEC)
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [nameFieldEmpty, setNameFieldEmpty] = useState(false)
  const [descriptionFieldEmpty, setDescriptionFieldEmpty] = useState(false)
  const lobbyJoined = useAppSelector((state) => state.room.lobbyJoined)

  const handleChange = (prop: keyof IRoomData) => (event: React.ChangeEvent<HTMLInputElement>) => {
    setValues({ ...values, [prop]: event.target.value })
  }

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const isValidName = values.name !== ''
    const isValidDescription = values.description !== ''

    if (isValidName === nameFieldEmpty) setNameFieldEmpty(!nameFieldEmpty)
    if (isValidDescription === descriptionFieldEmpty)
      setDescriptionFieldEmpty(!descriptionFieldEmpty)

    // create custom room if name and description are not empty
    if (isValidName && isValidDescription && lobbyJoined) {
      const bootstrap = phaserGame.scene.keys.bootstrap as Bootstrap
      // an office that should outlive the room needs a stable id to be found by
      const settings = { ...values, layout, ...(layout === 'generated' ? { office } : {}) }
      const room: IRoomData =
        lifetimeDays > 0 ? { ...settings, slug: newOfficeSlug(), lifetimeDays } : settings

      setError('')
      bootstrap.network
        .createCustom(room)
        .then(() => bootstrap.launchGame())
        .catch((createError) => {
          console.error(createError)
          setError(joinErrorMessage(createError, 'Could not create that room. Please try again.'))
        })
    }
  }

  return (
    <CreateRoomFormWrapper onSubmit={handleSubmit}>
      <TextField
        label="Name"
        variant="outlined"
        color="secondary"
        autoFocus
        error={nameFieldEmpty}
        helperText={nameFieldEmpty && 'Name is required'}
        onChange={handleChange('name')}
      />

      <TextField
        label="Description"
        variant="outlined"
        color="secondary"
        error={descriptionFieldEmpty}
        helperText={descriptionFieldEmpty && 'Description is required'}
        multiline
        rows={4}
        onChange={handleChange('description')}
      />

      <TextField
        type={showPassword ? 'text' : 'password'}
        label="Password (optional)"
        onChange={handleChange('password')}
        color="secondary"
        InputProps={{
          endAdornment: (
            <InputAdornment position="end">
              <IconButton
                aria-label="toggle password visibility"
                onClick={() => setShowPassword(!showPassword)}
                edge="end"
              >
                {showPassword ? <VisibilityOff /> : <Visibility />}
              </IconButton>
            </InputAdornment>
          ),
        }}
      />
      <TextFieldMui
        select
        label="Floor plan"
        variant="outlined"
        color="secondary"
        value={layout}
        onChange={(event) => setLayout(event.target.value as OfficeLayout)}
        helperText={OFFICE_LAYOUTS.find((option) => option.value === layout)?.hint}
      >
        {OFFICE_LAYOUTS.map((option) => (
          <MenuItem key={option.value} value={option.value}>
            {option.label}
          </MenuItem>
        ))}
      </TextFieldMui>

      {layout === 'generated' && (
        <OfficeSpecFields>
          <SpecHeading>
            What goes in it
            <span>
              {totalRooms(office)} room{totalRooms(office) === 1 ? '' : 's'} and{' '}
              {totalDesks(office)} desk{totalDesks(office) === 1 ? '' : 's'}. The building is sized
              to hold them.
            </span>
          </SpecHeading>

          {OFFICE_SPEC_FIELDS.map((field) => (
            <TextFieldMui
              key={field.key}
              type="number"
              label={field.label}
              variant="outlined"
              color="secondary"
              size="small"
              value={office[field.key]}
              helperText={field.hint}
              inputProps={{ min: 0, max: field.max }}
              onChange={(event) => {
                const asked = Math.floor(Number(event.target.value))
                const count = Number.isFinite(asked) ? Math.max(0, Math.min(asked, field.max)) : 0
                setOffice((current) => ({ ...current, [field.key]: count }))
              }}
            />
          ))}
        </OfficeSpecFields>
      )}

      <TextFieldMui
        select
        label="Keep this office"
        variant="outlined"
        color="secondary"
        value={lifetimeDays}
        onChange={(event) => setLifetimeDays(Number(event.target.value))}
        helperText={
          lifetimeDays > 0
            ? 'Its link keeps working for that long, even when nobody is inside.'
            : 'The office and its link close once everyone leaves.'
        }
      >
        {OFFICE_LIFETIMES.map((option) => (
          <MenuItem key={option.days} value={option.days}>
            {option.label}
          </MenuItem>
        ))}
      </TextFieldMui>

      <FormControlLabel
        control={
          <Checkbox
            color="secondary"
            checked={values.unlisted}
            onChange={(event) => setValues({ ...values, unlisted: event.target.checked })}
          />
        }
        label="Unlisted - only people with the room ID can find it"
      />

      {error && (
        <Alert severity="error" variant="outlined">
          {error}
        </Alert>
      )}

      <Button variant="contained" color="secondary" type="submit">
        Create
      </Button>
    </CreateRoomFormWrapper>
  )
}
