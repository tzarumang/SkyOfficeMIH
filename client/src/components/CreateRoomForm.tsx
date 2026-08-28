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
import { NO_LOGO } from '../../../types/Logo'
import LogoPicker from './LogoPicker'
import { joinErrorMessage } from '../joinErrors'
import { newOfficeSlug } from '../shareLink'
import { useAppSelector } from '../hooks'

import { bootstrapScene } from '../gameHandle'

/**
 * Three columns rather than one.
 *
 * Everything an office is made of used to be stacked in a single 320px strip,
 * which ran well past the bottom of the screen once a generated floor plan
 * added its own fields - so the Create button, the thing the whole form exists
 * to reach, was below the fold. Side by side it all fits at once, and the
 * three columns group it the way somebody filling it in thinks about it: what
 * the office is called, what is inside it, and how it behaves.
 */
const CreateRoomFormWrapper = styled.form`
  display: grid;
  grid-template-columns: repeat(3, 300px);
  gap: 18px 28px;
  align-items: start;

  /* narrow windows lose a column at a time rather than the layout */
  @media (max-width: 1180px) {
    grid-template-columns: repeat(2, 300px);
  }

  @media (max-width: 820px) {
    grid-template-columns: 320px;
  }
`

const Column = styled.div`
  display: flex;
  flex-direction: column;
  gap: 18px;
`

/** the error and the button belong to the whole form, not to one column of it */
const FullWidth = styled.div`
  grid-column: 1 / -1;
`

const OfficeSpecFields = styled.div`
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 14px;
  border: 1px solid rgba(255, 255, 255, 0.16);
  border-radius: 6px;

  /* one to a row: "Multi-purpose meeting rooms" does not fit beside anything,
     and MUI clips a label rather than wrapping it */
  .counts {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  /* the hints are the tallest thing in the form, so they are set tight */
  .counts .MuiFormHelperText-root {
    margin-top: 2px;
    line-height: 1.3;
  }
`

const SpecHeading = styled.div`
  font-size: 14px;
  font-weight: 600;

  span {
    display: block;
    margin-top: 4px;
    font-size: 12px;
    font-weight: 400;
    color: rgba(255, 255, 255, 0.72);
  }
`

export const CreateRoomForm = () => {
  const [values, setValues] = useState<IRoomData>({
    name: '',
    description: '',
    password: null,
    unlisted: false,
    roomba: false,
  })
  // 0 means the office closes when everyone leaves and its link dies with it
  const [lifetimeDays, setLifetimeDays] = useState(0)
  const [layout, setLayout] = useState<OfficeLayout>('classic')
  const [office, setOffice] = useState<OfficeSpec>(DEFAULT_OFFICE_SPEC)
  const [logo, setLogo] = useState<string>(NO_LOGO)
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
      const bootstrap = bootstrapScene()
      if (!bootstrap) return
      // an office that should outlive the room needs a stable id to be found by
      const settings = {
        ...values,
        layout,
        ...(logo === NO_LOGO ? {} : { logo }),
        ...(layout === 'generated' ? { office } : {}),
      }
      const room: IRoomData =
        lifetimeDays > 0 ? { ...settings, slug: newOfficeSlug(), lifetimeDays } : settings

      setError('')
      bootstrap.network
        .createCustom(room)
        .then(() => bootstrap.launchGame())
        .catch((createError) => {
          console.error(createError)
          setError(joinErrorMessage(createError, 'Could not create that office. Please try again.'))
        })
    }
  }

  return (
    <CreateRoomFormWrapper onSubmit={handleSubmit}>
      <Column>
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
      </Column>

      <Column>
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
                {totalDesks(office)} desk{totalDesks(office) === 1 ? '' : 's'}. The building is
                sized to hold them.
              </span>
            </SpecHeading>

            <div className="counts">
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
                    const count = Number.isFinite(asked)
                      ? Math.max(0, Math.min(asked, field.max))
                      : 0
                    setOffice((current) => ({ ...current, [field.key]: count }))
                  }}
                />
              ))}
            </div>
          </OfficeSpecFields>
        )}
      </Column>

      <Column>
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
          label="Unlisted - only people with the office ID can find it"
        />

        <FormControlLabel
          control={
            <Checkbox
              color="secondary"
              checked={values.roomba}
              onChange={(event) => setValues({ ...values, roomba: event.target.checked })}
            />
          }
          label="Cleaning robot - a little vacuum trundles around the office"
        />

        <LogoPicker value={logo} onChange={setLogo} />
      </Column>

      {error && (
        <FullWidth>
          <Alert severity="error" variant="outlined">
            {error}
          </Alert>
        </FullWidth>
      )}

      <FullWidth>
        <Button fullWidth variant="contained" color="secondary" type="submit">
          Create
        </Button>
      </FullWidth>
    </CreateRoomFormWrapper>
  )
}
